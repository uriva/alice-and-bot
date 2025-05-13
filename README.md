# alice-and-bot

## tasks

### security

1. handle faking the time
1. handle linking message to a bad conversation id
1. handle impersonation of the notification server
1. handle message being in the db but webhooks not called
1. limit editing instant entities
1. handle a member of the conversation injecting a geniuine signed message from
   someone outside
1. createConversation endpoint is public
1. notify endpoint is public

### flow

1. account owner creates two identities, one for bot and one for tester
1. it enrolls the bot identity with a webhook
1. it stores the user identity in the db
