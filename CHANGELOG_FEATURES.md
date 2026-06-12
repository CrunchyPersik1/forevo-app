# Новые функции Forevo

## Новые API-маршруты

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/api/users/check-username?username=` | Проверка доступности юзернейма |
| PUT | `/api/users/profile` | Сохранение имени и био |
| PATCH | `/api/users/me/username` | Смена юзернейма (раз в 30 дней) |
| POST | `/api/users/me/avatar` | Загрузка аватарки (multipart, max 2MB) |
| DELETE | `/api/users/me/avatar` | Удаление аватарки |
| GET | `/api/users/:id` | Профиль пользователя (+ статус блокировки) |
| POST | `/api/users/:id/block` | Заблокировать |
| DELETE | `/api/users/:id/block` | Разблокировать |
| GET | `/api/chats/:id` | Детали чата/группы |
| PATCH | `/api/chats/:id` | Переименовать группу |
| POST | `/api/chats/:id/avatar` | Аватар группы |
| DELETE | `/api/chats/:id/avatar` | Удалить аватар группы |
| DELETE | `/api/chats/:id/members/:userId` | Удалить участника |
| POST | `/api/chats/:id/admins` | Назначить администратора |
| POST | `/api/chats/:id/leave` | Выйти из группы |
| DELETE | `/api/chats/:id` | Удалить группу |
| DELETE | `/api/chats/:id/history` | Очистить историю для себя |

Статика: `/avatars/{userId}.webp`, `/avatars/groups/{chatId}.webp`

## Изменения в БД

**users** — новые поля:
- `username_updated_at` — дата последней смены юзернейма
- `last_avatar_update` — дата последней смены аватарки

**chat_members** — новое поле:
- `cleared_at` — очистка истории для конкретного пользователя

**Новые таблицы:**
- `user_blocks` (blocker_id, blocked_id, created_at)
- `group_admins` (chat_id, user_id, created_at)

## Запуск

```bash
npm run install:all   # если ещё не установлено
npm run dev           # разработка
```

Миграции применяются автоматически при старте сервера.

## Где в интерфейсе

| Функция | Где найти |
|---------|-----------|
| Аватарка | ⚙️ Профиль → клик по аватару / «Загрузить аватар» |
| Юзернейм | ⚙️ Профиль → поле «Имя пользователя» → «Проверить» → «Сохранить» |
| Био | ⚙️ Профиль → «О себе» |
| Чужой профиль | Клик по аватару/имени в шапке чата или в сообщении группы |
| Блокировка | Чужой профиль → «Заблокировать» |
| Группа | Шапка группового чата → клик по названию или ⋮ → «Настройки группы» |
| Очистить историю | ⋮ в шапке чата → «Очистить историю» |
