# alice-and-bot

## known security weaknesses

1. handle faking the time
1. handle linking message to a bad conversation id
1. handle impersonation of the notification server
1. handle message being in the db but webhooks not called
1. limit editing instant entities
1. handle a member of the conversation injecting a geniuine signed message from
   someone outside
1. createConversation endpoint is public
1. notify endpoint is public
