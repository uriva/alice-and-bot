# Alice&Bot 👧🤖

**tldr; it's time to kill Whatsapp by building a competitor oriented to bots,
not tied to a phone number, and allows easy white labeling.**

## Let's unbreak chat for the AI era.

I've been working on a new service - alice&bot, which is basically my (our?)
very own encrypted chat for bots and humans.

Think whatsapp, just without the red tape, easily embeddable everywhere, easy to
integrate with your AI agents, no sim cards required and no spam.

## How it all started

Let me circle back a bit how this all started. I've been working on AI agents
for the past years and lately I've started to notice that in many of my projects
the chat interface has become the bottleneck, rather than the AI or the business
logic: you choose between implementing your own limited solution or fighting
with endless bureaucracy and arbitrary rules of monopolies like whatsapp. Funny
isn't it?

It is obvious to me that we are going to be using natural language for
practically everything, but the monopoly on chat platforms makes it still very
difficult to expose our services in a nice user interface.

## So what was missing?

### You can't create multiple identities and manage them easily.

This has many use cases, maybe you want to talk to people on behalf of a
company, or you as an employer want to give your salesperson an identity that
they can use, but still belongs to the company. Maybe you met someone who you
don't trust yet and want to give them a burner identity, so you can communicate
with them but close the connection without repercussions.

You should be able to create as many identities as you like, without phone or
email. You should just pay for traffic. You should be able to manage them in a
single app.

The identities cannot be linked externally assuring anonymity. corollary -
creating accounts for nonhumans should be trivial. In whatsapp, bot creation is
incredibly difficult and prone to closure without reason, and no support to talk
to.

To get certain abilities, developers need to undergo reviews, specifically
difficult is sending messages to users without them initiating the conversation.
This is essential in the age of AI (if you think it may lead to spam, keep
reading).

### Embed anywhere

Sometimes we want to chat to our service providers in the context of a web page.
we should be able to embed a chat with representatives, and easily bring into
the conversation whoever we want.

Think of initiating a support conversation on the bank website, then bringing
your spouse into the conversation and continuing on mobile, along with your
other chats. we should be able to give others permission to view a conversation
without participating in it, as long as we have the permission to participate in
it.

This is useful for supervision over bots or other business use cases. APIs - we
should be able to send messages via api and receive them via webhook. There
should be no added cost to this, it should be trivial.

### Storage

Cloud storage should be baked in - so the chats are device independent.

### Freedom

You should be able to keep your identity even if the chat provider solution
fails or there is a better one. This can be achieved by having the identity be a
public/private key pair. so if you move between providers you can only message
that provider, but at least you have your "address book" with you, and it stays
relevant.

## What was good and needed to be preserved?

e2e encryption - this is already the standard, but it must be respected in any
new solution. convenience of using chats on mobile or desktop, with seamless
transition, including notifications

## The problem of spam

If anyone can create any number of identities, won't there be endless spam?

Paying to the platform provider for messages, storage and so on would be a tiny
expense and cannot serve to prevent spam (it does ensure the provider can keep
the service for any load).

I argue that captchas and anti bot systems are a thing of the past. Soon there
won't be a test AI cannot pass, and the whole notion that we need to prevent AI
from entering our social world is baseless. They are here to stay.

spam will only be prevented by a price tag that each account chooses to require
before accepting a chat from an unknown location. if you're a celebrity you
might ask for 1000$ for a chat in some public account you own, and it might make
sense for people to pay that. Obviously you can approve certain identities to
talk to you for free, and that would be the parallel of adding someone as a
friend.

## Why create a new network?

I've come to the conclusion that there is no incentive for whatsapp or telegram
to build this.

whatsapp has 150 designers who for the last 10 years managed to keep it looking
exactly the same. The org is something like 1600 developers. They are not
interested in solving this problem, but only to preserve their monopoly.

## How will this ever become popular? Why would anyone sign up?

Adoption of social apps is super difficult. The strategy here is to provide a
very easy way for developers to have chats on websites and in a dedicated app
for their ai creations. If this is comfortable enough, human to human
conversations would follow.

## How can I try it out?

Check out [our GitHub](https://github.com/uriva/alice-and-bot) and get to
chatting! 👧🤖
