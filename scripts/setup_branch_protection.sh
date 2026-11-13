#!/usr/bin/env bash
# Enable branch protection on main: require a PR, and require both CI checks to be green.
#
# STATUS: this cannot succeed while the repository is PRIVATE on the GitHub Free plan -- the API
# answers 403 "Upgrade to GitHub Pro or make this repository public to enable this feature". The
# script exists so that the decision is recorded once, in executable form, and re-running it after
# upgrading (or making the repo public) is a single command. Run it with `make protect`.
#
# The check names below are not free-form labels: they must match, character for character, the
# `name:` of the jobs in .github/workflows/ci.yml. A required context that GitHub never sees
# reports "Expected -- Waiting for status" forever, which blocks every merge while looking like a
# CI hang rather than a typo. Hence the preflight comparison against the real check runs.
#
# Emergency exit, if a misconfigured rule locks the repository (fill in owner/repo, or reuse the
# `REPO` value this script prints at the top):
#   gh api -X DELETE repos/<owner>/<repo>/branches/main/protection

set -euo pipefail

# The repository is read from the `origin` remote rather than baked in, so the script carries no
# account name and survives the repository being renamed, transferred, or forked. Both the ssh and
# the https spellings of a GitHub remote reduce to `owner/repo` with these two strips.
default_repo() {
    local url
    url=$(git remote get-url origin 2>/dev/null) || return 1
    url=${url%.git}
    url=${url#*github.com[:/]}
    [[ "$url" == */* && "$url" != *" "* ]] || return 1
    printf '%s\n' "$url"
}

REPO="${1:-$(default_repo || true)}"
if [[ -z "$REPO" ]]; then
    echo "无法从 origin 推导 <owner>/<repo>，请显式传入: $0 <owner>/<repo>" >&2
    exit 1
fi
BRANCH="main"
BACKEND_CHECK="Backend (ruff + pytest)"
FRONTEND_CHECK="Frontend (tsc + eslint + vitest + build)"

echo "=== Branch protection: $REPO/$BRANCH ==="
echo ""

command -v gh >/dev/null 2>&1 || {
    echo "需要 GitHub CLI: brew install gh" >&2
    exit 1
}
gh auth status >/dev/null 2>&1 || {
    echo "需要先登录: gh auth login --hostname github.com --git-protocol ssh --web" >&2
    exit 1
}

echo "--- Preflight: verify the required contexts exist on the latest commit ---"
actual=$(gh api "repos/$REPO/commits/HEAD/check-runs" --jq '.check_runs[].name' | sort)
if [[ -z "$actual" ]]; then
    echo "最近一次提交上没有任何 check 记录，说明 CI 从未运行过；先推送一次触发 workflow。" >&2
    exit 1
fi
for name in "$BACKEND_CHECK" "$FRONTEND_CHECK"; do
    if ! grep -qxF "$name" <<<"$actual"; then
        echo "CI 实际暴露的 check 名与脚本里的不一致: $name" >&2
        echo "  实际存在: $(tr '\n' '|' <<<"$actual")" >&2
        echo "  改 .github/workflows/ci.yml 的 job name，或改本脚本顶部的变量，二者必须同步。" >&2
        exit 1
    fi
done
echo "OK: both contexts found."
echo ""

# Each choice below is a deliberate trade-off, explained inline.
#   strict: true                        -- a PR must be synced with main before merging, so the
#                                          green checks actually describe the merged result. Costs
#                                          an "update branch" click whenever main moves ahead.
#   required_approving_review_count: 0  -- a PR is mandatory, but no second pair of eyes is, because
#                                          this is a single-author repository and count 1 would make
#                                          every merge impossible (GitHub forbids approving your own).
#   require_last_push_approval: false    -- with count 0 this only needs to not contradict the goal;
#                                          leaving it true would demand an approval the author cannot
#                                          give, silently reintroducing the count-1 deadlock.
#   enforce_admins: true                -- the repo owner is the only developer and is an admin, so
#                                          false would let every rule be bypassed by a plain
#                                          `git push origin main`, i.e. the protection would guard
#                                          nobody who matters.
payload=$(
    cat <<JSON
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["$BACKEND_CHECK", "$FRONTEND_CHECK"]
  },
  "required_pull_request_reviews": {
    "required_approving_review_count": 0,
    "dismiss_stale_reviews": true,
    "require_last_push_approval": false,
    "require_codeowner_files": false
  },
  "restrictions": null,
  "required_conversation_resolution": true,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "enforce_admins": true
}
JSON
)

echo "--- Applying ---"
response=$(gh api -X PUT "repos/$REPO/branches/$BRANCH/protection" --input - \
    <<<"$payload" 2>&1) && applied=1 || applied=0

if [[ $applied -eq 0 ]]; then
    if grep -qi "Upgrade to GitHub Pro\|make this repository public" <<<"$response"; then
        echo "分支保护对本仓库不可用（Free 计划的私有仓库）。" >&2
        echo "两条解锁路径，任选其一后重跑本脚本即可：" >&2
        echo "  1. 转公开: gh repo edit $REPO --visibility public" >&2
        echo "  2. 升级 Pro（保留私有）: https://github.com/account" >&2
        exit 2
    fi
    echo "$response" >&2
    exit 1
fi

echo "--- Verifying ---"
gh api "repos/$REPO/branches/$BRANCH/protection" \
    --jq '{required_checks: .required_status_checks.contexts, strict: .required_status_checks.strict, enforce_admins: .enforce_admins.enabled, require_pr: (.required_pull_request_reviews != null)}'

cat <<NOTE

完成。此后推 main 的正规路径:
  git switch -c <branch> && git push -u origin <branch>
  gh pr create --fill && gh pr merge --auto --squash
NOTE
