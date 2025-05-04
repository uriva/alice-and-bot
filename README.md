# alice-and-bot

## tasks
### security
1. handle faking the time
1. handle linking message to a bad conversation id
1. handle impersonation of the notification server
1. handle message being in the db but webhooks not called
1. limit editing instant entities

### basic e2e
1. deno deploy notification server with url in api

### flow
1. account owner creates two identities, one for bot and one for tester
1. it enrolls the bot identity with a webhook
1. it stores the user identity in the db