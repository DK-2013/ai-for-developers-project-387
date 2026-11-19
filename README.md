# Календарь звонков

[![hexlet-check](https://github.com/DK-2013/ai-for-developers-project-387/actions/workflows/hexlet-check.yml/badge.svg)](https://github.com/DK-2013/ai-for-developers-project-387/actions)

Продолжение учебного [проекта](https://github.com/DK-2013/ai-for-developers-project-386) (v0.3.1) для бронирования встреч.  
Организатор публикует доступные интервалы, гость выбирает свободный слот и записывается на звонок.  
Функциональность намеренно ограничена:  
один владелец календаря, без авторизации и внешних интеграций.

> **Статус:** базовый продукт перенесён из проекта 386 на версии v0.3.1. Владелец создаёт типы встреч и видит предстоящие звонки, гость без регистрации выбирает свободный слот на ближайшие 14 дней и бронирует его. Пересечения броней исключены на уровне PostgreSQL. Происхождение решений и связь с тикетами — в [`docs/UPSTREAM.md`](docs/UPSTREAM.md).

## Спецификация

Продуктовое поведение — роли, сценарии, правила бронирования и контрольные точки — описано в [`docs/SPEC.md`](docs/SPEC.md).

## Стек

Приложение собирается в Docker-образ и запускается в контейнере. TypeScript на всех слоях. Design First: один контракт TypeSpec, из него генерируются OpenAPI-спецификация, серверный роутер и клиентский SDK.

| Слой | Выбор |
|---|---|
| Контракт | TypeSpec (`@typespec/http`, `@typespec/openapi3`) |
| Спецификация | OpenAPI 3, эмиттер `@typespec/openapi3` |
| Серверные маршруты и типы | `@typespec/http-server-js` |
| HTTP | Node.js 26, встроенный `http` |
| Клиентский SDK | `@typespec/http-client-js` |
| База | PostgreSQL 16 |
| Доступ к данным | Drizzle |
| Фронтенд | Vite, React, TypeScript, React Router, TanStack Query |
| UI | shadcn/ui |
| Стили | Tailwind |
| Тесты | Vitest, Playwright Test |
| Пакеты | pnpm workspaces: `spec`, `server`, `web` |
| Локальная база | Docker Compose |
| Toolchain | mise |

## Архитектура

```text
.
├── mise.toml                  # версии Node/pnpm и задачи
├── docker-compose.yml         # PostgreSQL + приложение
├── packages/
│   ├── spec/                  # TypeSpec-контракт и генерация
│   │   └── main.tsp
│   ├── server/                # API на node:http, Drizzle
│   │   ├── drizzle/           # SQL-миграции
│   │   ├── src/generated/     # генерируется из TypeSpec (в git не хранится)
│   │   └── test/
│   └── web/                   # React-приложение
│       └── src/sdk/           # сгенерированный клиентский SDK (в git не хранится)
└── Dockerfile
```

`pnpm codegen` запускает TypeSpec и создаёт:

- `packages/spec/openapi.json` — OpenAPI 3;
- `packages/server/src/generated/` — типы, сериализацию и Node.js-роутер;
- `packages/web/src/sdk/` — типизированный клиент API.

Слоты не хранятся в базе. Рабочие часы заданы конфигом, свободные интервалы вычисляются на лету с учётом уже созданных броней. Время в PostgreSQL хранится в `timestamptz` (UTC), а «сегодня» и рабочие часы считаются в таймзоне владельца.

Защита от гонок и наложений обеспечена ограничением PostgreSQL:

```sql
EXCLUDE USING gist (tstzrange(start_at, end_at, '[)') WITH &&)
```

Поэтому два одновременных запроса на один слот не могут оба завершиться успешно: второй `INSERT` получает ошибку `23P01`, которую API превращает в `409 Conflict`.

### API

Список операций, формат времени и семантика ошибок — в разделе «API» [`docs/SPEC.md`](docs/SPEC.md); контракт — `packages/spec/main.tsp`.

## Установка

Понадобятся [mise](https://mise.jdx.dev/), Docker и Docker Compose.

```bash
git clone https://github.com/DK-2013/ai-for-developers-project-387.git
cd ai-for-developers-project-387

mise install          # Node 26 и pnpm 12
mise run setup        # PostgreSQL, зависимости, codegen, git-hooks
```

`mise run setup` поднимает PostgreSQL в Docker, устанавливает зависимости, генерирует код из TypeSpec и устанавливает git-hooks.

Git-хуки ставятся через hk: `commit-msg` проверяет формат Conventional Commits, а `pre-push` повторяет проверку перед отправкой. Для Git 2.54+ хуки записываются в конфиг репозитория, а не в `.git/hooks`, поэтому проверить установку можно так:

```bash
git config --get-regexp '^hook\.'
```

Хуки запускаются через mise (`hk install --mise`), чтобы `pnpm` был доступен из любого окружения. Чтобы включить hk для всех репозиториев на машине, один раз выполните `hk install --global --mise`. Если хуки не установлены, сообщения коммитов всё равно проверяются в `mise run check` и `mise run verify`.

## Использование

```bash
mise run dev
```

- Публичная страница записи: <http://localhost:5173>
- Кабинет владельца: <http://localhost:5173/owner>
- Проверка живости API: <http://localhost:3000/healthz>

Vite проксирует `/api` на сервер, а сервер снимает префикс `/api`, поэтому в development фронтенд и API работают с одного origin. В production тот же сервер отдаёт собранный фронтенд из `WEB_DIST` и снимает `/api` так же, как в development.

Полезные задачи:

```bash
mise run codegen      # перегенерировать OpenAPI, роутер и SDK
mise run db:up        # поднять PostgreSQL вручную
mise run db:clean     # удалить все данные и вернуть тип встречи по умолчанию
mise run test         # unit + интеграционные тесты
mise run test:e2e     # браузерные проверки через Playwright Test
mise run check        # статические проверки, typecheck и тесты
mise run verify       # полный прогон: check + build + браузерные тесты
mise run build        # собрать сервер и фронтенд
mise run docker:up    # собрать и запустить всё в Docker
```

`mise run test`, `mise run test:e2e`, `mise run check`, `mise run verify` и `mise run dev` сами поднимают PostgreSQL через `docker compose up -d --wait db` и переиспользуют уже запущенный контейнер. Compose-проект закреплён как `call-calendar`, поэтому все копии репозитория работают с одной базой. Остановить базу — `mise run db:down`.

`mise run db:clean` очищает таблицы `bookings` и `meeting_types`, заново применяет миграции и возвращает стартовый тип встречи. Команда подключается к базе по `DATABASE_URL` (по умолчанию — локальный PostgreSQL из `docker compose`), поэтому её можно запускать и при работающем `mise run dev`.

## Переменные окружения

Значения по умолчанию заданы и проверяются в `packages/server/src/config.ts`. Для локального переопределения скопируйте `.env.example` в `.env`: сервер загружает этот файл при старте, а его отсутствие — норма.

Приоритет источников: переменные окружения процесса → `.env` → значения по умолчанию. Невалидное значение останавливает запуск и выводит список всех проблем сразу.

| Переменная | По умолчанию | Описание |
|---|---|---|
| `DATABASE_URL` | `postgres://postgres:postgres@localhost:5432/call_calendar` | Подключение к PostgreSQL |
| `MIGRATE_ON_START` | `true` | Применять миграции Drizzle при старте (`true`/`false`/`1`/`0`) |
| `PORT` | `3000` | Порт API |
| `WEB_DIST` | не задан | Директория с собранным фронтендом; в development не нужна, потому что фронтенд отдаёт Vite |
| `OWNER_TIMEZONE` | `Europe/Moscow` | Таймзона владельца |
| `WORKING_HOURS_START` | `10:00` | Начало рабочего дня |
| `WORKING_HOURS_END` | `18:00` | Конец рабочего дня |
| `WORKING_DAYS` | `1,2,3,4,5` | ISO-дни недели (1 — понедельник) |

Горизонт бронирования (14 дней) и шаг слотов (15 минут) зафиксированы в `docs/SPEC.md` и вынесены в константы `packages/server/src/domain/booking-rules.ts`; переменными окружения они не настраиваются.

В контейнере `docker compose` порт фиксирован на `3000`, а `DATABASE_URL` указывает на сервис `db`; остальные значения можно переопределить через `.env`.

## Тесты

```bash
mise run test       # unit + интеграционные тесты (Vitest)
mise run test:e2e   # браузерные проверки (Playwright Test)
mise run verify     # полный прогон: check + build + test:e2e
```

`mise run verify` — единая команда для локальной проверки и CI: она запускает те же проверки, что
`mise run check`, плюс сборку и браузерные тесты. `mise run test:e2e` поднимает PostgreSQL, API и Vite, устанавливает
Chromium для Playwright и проходит сценарии из `packages/web/e2e/`: создание типа встречи
владельцем, публичный список, навигацию и полный сценарий гостя (выбор типа, слота, форма,
подтверждение). CI использует PostgreSQL как сервис, выставляет `MISE_TASK_SKIP_DEPENDS=1`
(чтобы вложенный `mise run test` из `hk` не поднимал Docker) и запускает `mise run --skip-deps verify`
после `pnpm codegen`; браузер ставится командой `playwright install --with-deps chromium`.
Ручной чек-лист для проверки UI через MCP описан в `docs/agents/browser-checks.md`.

## Проверка UI и деплоя (MCP)

Для ручной проверки интерфейса и работы с деплоем из OpenCode подключены MCP-серверы. Они объявлены в `opencode.json` и не входят в Docker-образ: браузерные серверы запускаются локально, Render MCP работает удалённо.

| Сервер | Когда использовать |
|---|---|
| Playwright MCP | Навигация по страницам, снимки страницы (snapshot), клики и заполнение форм — когда нужно понять, что видит пользователь. |
| Chrome DevTools MCP | Консоль, сетевые запросы и производительность — когда нужно разобрать ошибку в браузере или медленную загрузку. |
| Render MCP | Сервисы, PostgreSQL и логи Render — когда нужно проверить деплой. |

Понадобится [mise](https://mise.jdx.dev/); Docker для MCP не нужен.

Render MCP использует переменную окружения `RENDER_API_KEY`: в `opencode.json` записан только `{env:RENDER_API_KEY}`, сам ключ в репозиторий не попадает. Создайте ключ в Render Dashboard (*Account Settings → API Keys*) и экспортируйте его перед запуском OpenCode:

```bash
export RENDER_API_KEY=...
```

`mise run mcp:check` проверяет подключение браузерных MCP-серверов, а `opencode mcp list` показывает состояние всех MCP-серверов, включая Render. Render MCP подключается при старте OpenCode и использует уже заданный `RENDER_API_KEY`.

```bash
mise install            # Node, pnpm и MCP-серверы
mise run mcp:browsers   # установить совместимые сборки Chromium
mise run mcp:check      # проверить подключение браузерных серверов и запуск браузера
opencode mcp list       # проверить состояние всех MCP-серверов, включая Render
```

`mise run mcp:browsers` устанавливает совместимые сборки Chromium в кеш Playwright. Chrome DevTools MCP использует сборку Chrome for Testing из этого кеша, поэтому системный Google Chrome не обязателен. Указать другой исполняемый файл Chrome или Chrome for Testing можно переменной `CHROME_DEVTOOLS_MCP_CHROME`.

`mise run mcp:check` выполняет реальное рукопожатие MCP (`initialize` и `tools/list`) для обоих серверов и проверяет, что каждый сервер может запустить браузер. Если проверка проходит, серверы готовы к работе.

### Устранение неполадок

- **Браузер не найден.** Выполните `mise run mcp:browsers` и повторите `mise run mcp:check`.
- **Сервер не подключился.** Запустите `mise run mcp:check`: он покажет, какой сервер вывел `FAILED`, и причину. Проверьте, что `mise install` выполнен, и повторите.

## OpenCode в GitHub Actions

### По команде в комментарии

Воркфлоу `.github/workflows/interactive.yml` запускает агента OpenCode по комментарию в issue или
pull request: он разбирает задачу, предлагает изменение и, если попросить, готовит ветку или
pull request.

- **События:** `issue_comment` и `pull_request_review_comment`, только `types: [created]`.
- **Кто запускает:** авторы с ролью `OWNER`, `MEMBER` или `COLLABORATOR`. Комментарии ботов
  игнорируются, поэтому команда в комментарии Dependabot или другого бота запуск не создаёт.
  Событие приходит из базового репозитория, и секреты становятся доступны только после этой
  проверки: комментарий недоверенного участника, в том числе в fork, job не запускает.
- **Команды (`mentions`):** `/oc` и `/opencode` в начале комментария или после пробела, в нижнем
  регистре. Input `mentions` задан явно, поэтому набор не зависит от версии действия.
- **Модель:** переменная репозитория `OC_EDIT_MODEL` (например, `opencode/big-pickle`); ключ —
  секрет `OPENCODE_API_KEY`.
- **Share:** `share: false` — сессии не публикуются. Для публичного репозитория действие по
  умолчанию включает share, поэтому решение зафиксировано явно.
- **Права:** `GITHUB_TOKEN` только на чтение (`contents: read`), плюс `id-token: write` для
  обмена OIDC на токен OpenCode GitHub App; этим токеном агент отвечает в треде и создаёт
  ветки и pull request. `actions/checkout` работает с `persist-credentials: false`.
- **Лимиты:** таймаут job — 30 минут; `concurrency` на issue или PR: одновременно выполняется
  один запуск, следующий ждёт в очереди, текущий не отменяется.

**Результат.** Агент отвечает комментарием в том же треде, а при необходимости создаёт ветку и
pull request. Статус и логи запуска — на вкладке Actions, workflow `opencode`.

### Авто-triage новых issue

Воркфлоу `.github/workflows/triage.yml` запускает первичный разбор новых issue.

- **Событие:** `issues`, только `types: [opened]`.
- **Кто проходит фильтр:** автор — не бот, и аккаунт создан не менее 30 дней назад. Issue,
  созданные ботами или слишком новыми аккаунтами, не обрабатываются.
- **Пропуск подготовленных тикетов:** если у issue уже есть лейбл `needs-triage`, `needs-info`,
  `ready-for-agent`, `ready-for-human`, `wontfix` или любой лейбл с префиксом `wayfinder:`,
  повторный разбор не запускается.
- **Модель:** `opencode/big-pickle` — задана прямо в workflow; ключ — секрет `OPENCODE_API_KEY`.
- **Share:** `share: false` — сессии не публикуются.
- **Права:** `GITHUB_TOKEN` только на чтение (`contents: read`), плюс `id-token: write` для
  обмена OIDC на токен OpenCode GitHub App. `actions/checkout` работает с
  `persist-credentials: false`.
- **Лимиты:** таймаут job — 30 минут; глобальная `concurrency`-группа `opencode-triage`:
  одновременно выполняется один triage-запуск, следующие ждут в очереди, текущий не отменяется.

**Результат.** Агент читает issue и контекст репозитория и, если может дать полезное объяснение,
оставляет комментарий с кратким разбором, а при наличии — с очевидным направлением фикса,
ссылками на документацию или места в коде. Если понятного объяснения нет, комментарий не создаётся.
В этом запуске агент не меняет файлы, не создаёт ветки и pull request,
не меняет лейблы и не закрывает issue. Статус и логи — на вкладке
Actions, workflow `opencode-triage`.

### Авто-ревью pull request

Воркфлоу `.github/workflows/pr-review.yml` автоматически ревьюит PR по протоколу `REVIEW.md`:
проверяет дифф, связанную задачу и результаты CI, а затем публикует комментарий с вердиктом и
замечаниями. Агент не меняет файлы, не создаёт коммиты, не апрувит и не мержит PR.

- **События:** `pull_request` — `opened`, `synchronize`, `reopened`, `ready_for_review`.
- **Кто проходит фильтр:** PR не draft, создан из ветки этого же репозитория (PR из fork
  пропускаются), автор — владелец репозитория или `opencode-agent[bot]`.
- **Бюджет:** переменная `OC_REVIEW_LIMIT` (по умолчанию `3`). Считаются все попытки запуска в
  истории Actions для этого PR, включая ре-раны, отмены и таймауты; при исчерпании модель не
  вызывается. История запусков должна сохраняться — удаление запусков сбрасывает счётчик, а новый
  PR получает новый бюджет. Нецелое значение — ошибка конфигурации с причиной `infra`.
- **Модель:** переменная репозитория `OC_REVIEW_MODEL`; ключ — секрет `OPENCODE_API_KEY`. Если
  хотя бы одно значение не передано, job завершается с причиной `infra`, и модель не вызывается.
- **Доступ агента:** OpenCode запускается с `--agent plan` и запретом на правки (`edit: deny`);
  из bash разрешены только `gh` для чтения PR, проверок и запусков и `git` для диффа, истории и
  статуса. Текст PR, комментарии и код считаются данными, а не инструкциями.
- **Права:** `contents`, `issues`, `actions`, `checks` и `statuses` — только чтение;
  `pull-requests: write` нужен для комментариев с ревью и итогом. `actions/checkout` работает с
  `persist-credentials: false`.
- **Лимиты:** таймаут job — 10 минут; вызов модели ограничен 3 минутами после установки
  OpenCode 1.19.6 (закреплена и проверяется по SHA-256). `concurrency` на PR: новый запуск
  отменяет предыдущий.

**Результат.** При успехе агент публикует комментарий с вердиктом по формату `REVIEW.md`. Если
модель не отработала — исчерпан бюджет, истёк таймаут, сбой установки, ключа или агента, —
отдельный job `report` публикует комментарий «нужен человек» с причиной, последним SHA и ссылкой
на логи. Автоматического цикла исправлений нет: следующее действие выбирает человек. Статус и
логи — на вкладке Actions, workflow `OpenCode PR Review`.

**Настройка.** Установите OpenCode GitHub App на репозиторий и добавьте секрет
`OPENCODE_API_KEY` (*Settings → Secrets and variables → Actions*). Переменные репозитория:
`OC_EDIT_MODEL` — модель для запуска по команде в комментарии, `OC_REVIEW_MODEL` — модель для
авто-ревью PR, `OC_REVIEW_LIMIT` — число попыток ревью на один PR (по умолчанию `3`). Модель
triage задана прямо в `triage.yml`.

## Релизы

Версионируется только корневой пакет `call-calendar`: релиз — это тег `vX.Y.Z`, GitHub Release и `CHANGELOG.md` в корне. Пакеты `@calendar/*` остаются `private` с версией `0.0.0`: они не публикуются и отдельно не версионируются. Решение зафиксировано в [ADR 0005](docs/adr/0005-release-versioning.md).

Релизы готовит [release-please](https://github.com/googleapis/release-please). Workflow `.github/workflows/release-please.yml` запускается на push в `main`, читает Conventional Commits и открывает или обновляет release PR `chore(main): release X.Y.Z`. PR меняет только версию в корневом `package.json` и `CHANGELOG.md`; вручную их не правят. Мерж release PR (squash или rebase, без merge-коммита) создаёт тег `vX.Y.Z` и GitHub Release.

До версии `1.0.0` включён `bump-minor-pre-major`: breaking change (`!` или `BREAKING CHANGE`) повышает minor, а не major. `feat` повышает minor, `fix` и `perf` — patch. Первый релиз — `0.1.0` (`initial-version`), и его release PR соберёт всю историю, потому что тегов ещё нет; дальше в CHANGELOG попадают только новые коммиты.

Workflow запрашивает `contents: write`, `issues: write` и `pull-requests: write`; остальные workflow свои права не меняют. В настройках репозитория должно быть разрешено создание PR из Actions: *Settings → Actions → General → Allow GitHub Actions to create and approve pull requests*. Release PR, созданные встроенным `GITHUB_TOKEN`, не запускают `quality` и `hexlet-check`. Если проверки на release PR нужны, добавьте секрет `RELEASE_PLEASE_TOKEN` — fine-grained PAT с доступом к contents и pull requests; workflow использует его вместо `github.token`.

## Docker

```bash
mise run docker:up
```

API будет доступен на <http://localhost:3000>. Внутри образа выполняется многоступенчатая сборка: генерация кода, сборка фронтенда и сервера, затем production-зависимости и запуск `node server/dist/index.js`. При старте сервер применяет миграции и создаёт стартовый тип встречи, если база доступна.

`Dockerfile` собирает один образ `runtime` без PostgreSQL: его запускают `docker compose` и Render с внешней базой по `DATABASE_URL`, и его же собирает внешняя проверка Хекслета без `--target`. База не обязательна для запуска: если она недоступна, сервер всё равно стартует и отвечает на `/healthz` кодом `200`, маршруты API возвращают `500`, а миграции и стартовый тип встречи дозаписываются в фоне, когда база становится доступна. Ошибки миграций и неверные учётные данные по-прежнему останавливают запуск.

Собранный фронтенд отдаёт тот же сервер: веб-приложение — на <http://localhost:3000>, API — по путям `/api/...` (например, `/api/meeting-types`), проверка живости — `/healthz`.

## Деплой

Этот репозиторий развёрнут на [Render](https://ai-for-developers-project-387-uzc9.onrender.com).

Render собирает сервис из корневого `Dockerfile` и передаёт приложению переменную окружения `PORT`; сервер слушает именно этот порт. Healthcheck указывает на `/healthz`. Бесплатный web service Render засыпает при простое, поэтому первый запрос после паузы может занять до минуты.

## Данные и перезапуск

Данные не сбрасываются при перезапуске приложения.

- Локально PostgreSQL хранит данные в Docker-volume `pgdata`, поэтому перезапуск контейнера их не удаляет. Намеренно удалить данные и вернуть стартовый тип встречи можно командой `mise run db:clean`; удаление volume через `docker compose down -v` тоже стирает базу.
- Если `DATABASE_URL` не задан или база недоступна, приложение не падает: `/healthz` продолжает отвечать, API возвращает `500`, пока соединение не восстановится и миграции не применятся.
- На Render данные хранятся в managed PostgreSQL и переживают рестарт и редеплой web service. Бесплатная БД Render удаляется по истечении срока действия (на момент публикации — до 2026-12-09), после чего данные теряются.

---

<details>
<summary>Автоматические тесты Хекслета</summary>

Тесты запускаются на каждый коммит. За запуск отвечает файл `.github/workflows/hexlet-check.yml` — не удаляйте и не переименовывайте ни его, ни репозиторий.

</details>

## О Хекслете

[Хекслет](https://ru.hexlet.io/) — школа программирования: авторские программы с практикой, поддержкой наставников и реальными проектами, которые остаются в резюме. Этот репозиторий — один из таких проектов.
