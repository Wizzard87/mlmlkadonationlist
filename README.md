# Веб-клиент очереди заказов

Отдельная статическая страница для GitHub Pages. Она не содержит API-ключа: Discord OAuth выполняется сервером, а доступ выдаётся только ID из `DiscordAuth__AdminIds`.

## Публикация на GitHub Pages

1. Создайте отдельный публичный GitHub-репозиторий для сайта.
2. Скопируйте **содержимое** папки `web-admin` в корень репозитория (включая `.github/workflows/pages.yml`).
3. В `config.js` укажите публичный HTTPS API адрес. Для текущего сервера это `https://141.253.98.157:8443`; секретов в этом файле быть не должно.
4. В репозитории откройте **Settings → Pages** и выберите источник **GitHub Actions**.
5. Запустите workflow **Deploy static site to GitHub Pages** из вкладки **Actions** или отправьте commit в ветку `main`.

Адрес сайта будет вида `https://ВАШ_АККАУНТ.github.io/ИМЯ_РЕПОЗИТОРИЯ/` (для репозитория `ВАШ_АККАУНТ.github.io` адрес будет без имени проекта).

## Discord OAuth и сервер

1. В [Discord Developer Portal](https://discord.com/developers/applications) создайте приложение. Скопируйте **Application ID** и **Client Secret** из OAuth2.
2. Добавьте Redirect URI, в точности совпадающий с `DiscordAuth__RedirectUri`, например `https://141.253.98.157:8443/api/auth/discord/callback`.
3. В `/opt/mlmlka-donations/.env` на VDS добавьте или обновите эти строки:

```dotenv
DiscordAuth__ClientId=APPLICATION_ID
DiscordAuth__ClientSecret=CLIENT_SECRET
DiscordAuth__RedirectUri=https://141.253.98.157:8443/api/auth/discord/callback
DiscordAuth__FrontendUrl=https://ВАШ_АККАУНТ.github.io/ИМЯ_РЕПОЗИТОРИЯ/
DiscordAuth__AdminIds=1049347425434865794,386589646928347136
Web__AllowedOrigins=https://ВАШ_АККАУНТ.github.io
```

`Web__AllowedOrigins` — origin без пути и завершающего `/`. Если сайт публикуется под собственным доменом, укажите его HTTPS origin.

4. На VDS пересоберите и перезапустите сервер из каталога проекта:

```bash
cd /opt/mlmlka-donations
docker compose up -d --build bot
docker compose logs --tail=100 bot
```

5. Проверьте, что `https://141.253.98.157:8443/health` открывается в браузере без предупреждения о сертификате. Браузер не позволит сайту GitHub Pages обращаться к API с недоверенным или просроченным TLS-сертификатом.
6. Откройте адрес Pages и нажмите «Войти через Discord». Приложение запрашивает только `identify`, не получает доступ к серверам, сообщениям или управлению аккаунтом.

Проверка Discord ID серверная. OAuth state cookie нужен только на время перехода Discord → API; веб-сессия хранится в памяти сервера и истекает через 8 часов. При перезапуске API сессии потребуется пройти вход заново. Существующий API key продолжит работать в настольном клиенте.

## Возможности

- просмотр и обновление очереди заказов;
- добавление заказа вручную;
- выбор нескольких строк и пакетное удаление;
- просмотр журнала распознавания;
- повтор распознавания и подтверждение заказа из статуса «Нужна проверка»;
- просмотр состояния DonationAlerts и DonatePay.

Если вход возвращает `not_admin`, проверьте, что пользователь вошёл именно в один из разрешённых Discord аккаунтов. Не добавляйте API key или Discord Client Secret в `config.js`, HTML или репозиторий Pages.
