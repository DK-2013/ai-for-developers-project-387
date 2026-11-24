#!/usr/bin/env bash
# Publish a comment explaining why the /oc model did not finish.
#
# Usage:
#   oc-report.sh
#
# Env: GH_TOKEN, REPO, NUMBER, ON_PR, BUDGET_ALLOWED, BUDGET_REASON,
#       USED, LIMIT, AGENT_RESULT, AGENT_REASON, MODEL_STARTED,
#       RECORD_RESULT, RUN_URL, GITHUB_SHA
set -euo pipefail

# Determine reason and detail from the outcome.
if [ "$BUDGET_ALLOWED" != "true" ]; then
  case "${BUDGET_REASON:-infra}" in
    limit_exhausted)
      reason=limit_exhausted
      detail="Бюджет запросов к агенту на этот PR исчерпан (${USED:-?} из ${LIMIT:-?}). Модель не вызывалась."
      ;;
    fork)
      reason=fork
      detail="PR создан из fork: его код не должен видеть ключ модели. Запуск отклонён."
      ;;
    *)
      reason=infra
      detail="Сбой проверки перед вызовом модели (бюджет, права App или конфигурация лимита). Модель не вызывалась."
      ;;
  esac
elif [ "$AGENT_RESULT" = "success" ]; then
  if [ "${ON_PR:-false}" != "true" ] || [ "$RECORD_RESULT" = "success" ]; then
    exit 0
  fi
  reason=infra
  detail="Не удалось записать попытку в бюджет; счётчик мог не увеличиться."
elif [ "$AGENT_RESULT" = "cancelled" ]; then
  reason=infra
  detail="Агент был остановлен после допуска; попытка учтена в бюджете."
else
  case "${AGENT_REASON:-}:${MODEL_STARTED:-}" in
    timeout:*)
      reason=timeout
      detail="Агент не уложился в отведённое время и был остановлен."
      ;;
    :true)
      reason=agent_failed
      detail="Агент завершился ошибкой после старта модели."
      ;;
    :*)
      reason=infra
      detail="Сбой подготовки до вызова модели."
      ;;
    *)
      reason="$AGENT_REASON"
      detail="Агент завершился ошибкой или был остановлен."
      ;;
  esac
fi

sha=$GITHUB_SHA
if [ "${ON_PR:-false}" = "true" ]; then
  sha=$(gh pr view "$NUMBER" --repo "$REPO" --json headRefOid --jq .headRefOid) || sha=$GITHUB_SHA
fi

body="$RUNNER_TEMP/oc-report.md"
cat > "$body" <<EOF
**Нужен человек.** Причина: \`$reason\`.

$detail

- Последний SHA: \`$sha\`
- Логи: $RUN_URL
EOF

gh issue comment "$NUMBER" --repo "$REPO" --body-file "$body"
