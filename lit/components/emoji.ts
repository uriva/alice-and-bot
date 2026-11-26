export type EmojiEntry = {
  shortcode: string;
  emoji: string;
  aliases?: readonly string[];
  keywords?: readonly string[];
};

export type ReactionMode = "add" | "remove";

export type EmojiAutocompleteMatch = {
  triggerIndex: number;
  filter: string;
  reactionMode: ReactionMode | null;
};

export const quickReactionEmojis = ["👍", "❤️", "😂", "😮", "🙏"] as const;

export const emojiCatalog: readonly EmojiEntry[] = [
  {
    shortcode: "+1",
    emoji: "👍",
    aliases: ["thumbsup", "like", "yes"],
    keywords: ["approve", "ok", "agree", "good"],
  },
  {
    shortcode: "-1",
    emoji: "👎",
    aliases: ["thumbsdown", "dislike", "no"],
    keywords: ["disapprove", "bad"],
  },
  {
    shortcode: "heart",
    emoji: "❤️",
    aliases: ["red_heart", "love"],
    keywords: ["like", "affection"],
  },
  {
    shortcode: "joy",
    emoji: "😂",
    aliases: ["lol", "tears_of_joy"],
    keywords: ["laugh", "funny", "haha", "cry"],
  },
  {
    shortcode: "fire",
    emoji: "🔥",
    aliases: ["lit", "hot"],
    keywords: ["flame", "awesome", "burn"],
  },
  {
    shortcode: "pray",
    emoji: "🙏",
    aliases: ["thanks", "please", "folded_hands"],
    keywords: ["thank", "grateful", "hope", "namaste"],
  },
  {
    shortcode: "tada",
    emoji: "🎉",
    aliases: ["party", "hooray"],
    keywords: ["celebrate", "congrats", "confetti"],
  },
  {
    shortcode: "rocket",
    emoji: "🚀",
    aliases: ["ship", "launch"],
    keywords: ["fast", "space", "deploy", "moon"],
  },
  {
    shortcode: "eyes",
    emoji: "👀",
    aliases: ["looking", "look"],
    keywords: ["watch", "see", "review"],
  },
  {
    shortcode: "100",
    emoji: "💯",
    aliases: ["hundred"],
    keywords: ["perfect", "score", "agree"],
  },
  {
    shortcode: "smile",
    emoji: "😄",
    aliases: ["happy"],
    keywords: ["grin", "joy", "glad"],
  },
  {
    shortcode: "grinning",
    emoji: "😀",
    aliases: ["grin"],
    keywords: ["smile", "happy"],
  },
  {
    shortcode: "smiley",
    emoji: "😃",
    keywords: ["smile", "happy"],
  },
  {
    shortcode: "slightly_smiling_face",
    emoji: "🙂",
    aliases: ["slightly_smiling", "slight_smile"],
    keywords: ["smile", "ok"],
  },
  {
    shortcode: "upside_down_face",
    emoji: "🙃",
    aliases: ["upside_down"],
    keywords: ["sarcasm", "silly"],
  },
  {
    shortcode: "wink",
    emoji: "😉",
    keywords: ["flirt", "playful"],
  },
  {
    shortcode: "blush",
    emoji: "😊",
    keywords: ["smile", "warm", "shy"],
  },
  {
    shortcode: "innocent",
    emoji: "😇",
    aliases: ["angel"],
    keywords: ["halo", "good"],
  },
  {
    shortcode: "smiling_face_with_3_hearts",
    emoji: "🥰",
    aliases: ["in_love", "hearts"],
    keywords: ["love", "adore"],
  },
  {
    shortcode: "heart_eyes",
    emoji: "😍",
    keywords: ["love", "crush", "adore"],
  },
  {
    shortcode: "star_struck",
    emoji: "🤩",
    aliases: ["starstruck"],
    keywords: ["amazed", "wow", "excited"],
  },
  {
    shortcode: "kissing_heart",
    emoji: "😘",
    aliases: ["kiss"],
    keywords: ["love", "flirt"],
  },
  {
    shortcode: "yum",
    emoji: "😋",
    keywords: ["delicious", "tasty", "food"],
  },
  {
    shortcode: "stuck_out_tongue",
    emoji: "😛",
    aliases: ["tongue"],
    keywords: ["playful", "silly"],
  },
  {
    shortcode: "stuck_out_tongue_winking_eye",
    emoji: "😜",
    keywords: ["crazy", "playful"],
  },
  {
    shortcode: "zany_face",
    emoji: "🤪",
    aliases: ["zany", "crazy"],
    keywords: ["goofy", "wild"],
  },
  {
    shortcode: "rofl",
    emoji: "🤣",
    aliases: ["lmao"],
    keywords: ["laugh", "funny", "haha"],
  },
  {
    shortcode: "sweat_smile",
    emoji: "😅",
    aliases: ["phew"],
    keywords: ["nervous", "relief", "awkward"],
  },
  {
    shortcode: "laughing",
    emoji: "😆",
    aliases: ["satisfied", "haha"],
    keywords: ["laugh", "happy"],
  },
  {
    shortcode: "thinking",
    emoji: "🤔",
    aliases: ["thinking_face", "hmm"],
    keywords: ["wonder", "curious", "consider"],
  },
  {
    shortcode: "saluting_face",
    emoji: "🫡",
    aliases: ["salute"],
    keywords: ["respect", "roger", "aye"],
  },
  {
    shortcode: "melting_face",
    emoji: "🫠",
    aliases: ["melting", "melt"],
    keywords: ["hot", "embarrassed", "awkward"],
  },
  {
    shortcode: "shushing_face",
    emoji: "🤫",
    aliases: ["shush", "quiet"],
    keywords: ["secret", "silent"],
  },
  {
    shortcode: "hugging_face",
    emoji: "🤗",
    aliases: ["hug", "hugs"],
    keywords: ["warm", "care"],
  },
  {
    shortcode: "hand_over_mouth",
    emoji: "🤭",
    aliases: ["giggle", "oops"],
    keywords: ["shy", "whoops"],
  },
  {
    shortcode: "zipper_mouth_face",
    emoji: "🤐",
    aliases: ["zipper_mouth", "sealed"],
    keywords: ["secret", "quiet"],
  },
  {
    shortcode: "raised_eyebrow",
    emoji: "🤨",
    aliases: ["skeptical", "sus"],
    keywords: ["doubt", "suspicious"],
  },
  {
    shortcode: "neutral_face",
    emoji: "😐",
    aliases: ["meh"],
    keywords: ["blank", "indifferent"],
  },
  {
    shortcode: "expressionless",
    emoji: "😑",
    keywords: ["blank", "unimpressed"],
  },
  {
    shortcode: "smirk",
    emoji: "😏",
    keywords: ["smug", "sly"],
  },
  {
    shortcode: "unamused",
    emoji: "😒",
    keywords: ["annoyed", "meh"],
  },
  {
    shortcode: "roll_eyes",
    emoji: "🙄",
    aliases: ["rolling_eyes"],
    keywords: ["whatever", "annoyed"],
  },
  {
    shortcode: "grimacing",
    emoji: "😬",
    aliases: ["grimace", "awkward"],
    keywords: ["yikes", "nervous"],
  },
  {
    shortcode: "relieved",
    emoji: "😌",
    keywords: ["calm", "peaceful"],
  },
  {
    shortcode: "pensive",
    emoji: "😔",
    keywords: ["sad", "thoughtful"],
  },
  {
    shortcode: "sleepy",
    emoji: "😪",
    keywords: ["tired", "sleep"],
  },
  {
    shortcode: "sleeping",
    emoji: "😴",
    aliases: ["zzz"],
    keywords: ["tired", "nap", "bed"],
  },
  {
    shortcode: "yawning_face",
    emoji: "🥱",
    aliases: ["yawn"],
    keywords: ["bored", "tired"],
  },
  {
    shortcode: "sunglasses",
    emoji: "😎",
    aliases: ["cool"],
    keywords: ["awesome", "chill"],
  },
  {
    shortcode: "nerd_face",
    emoji: "🤓",
    aliases: ["nerd", "geek"],
    keywords: ["glasses", "smart"],
  },
  {
    shortcode: "monocle_face",
    emoji: "🧐",
    aliases: ["monocle", "inspect"],
    keywords: ["curious", "investigate"],
  },
  {
    shortcode: "confused",
    emoji: "😕",
    keywords: ["unsure", "puzzled"],
  },
  {
    shortcode: "worried",
    emoji: "😟",
    keywords: ["concerned", "anxious"],
  },
  {
    shortcode: "slightly_frowning_face",
    emoji: "🙁",
    aliases: ["frown", "sad"],
    keywords: ["unhappy"],
  },
  {
    shortcode: "open_mouth",
    emoji: "😮",
    aliases: ["wow", "surprised"],
    keywords: ["shock", "gasp"],
  },
  {
    shortcode: "hushed",
    emoji: "😯",
    keywords: ["surprised", "stunned"],
  },
  {
    shortcode: "astonished",
    emoji: "😲",
    keywords: ["amazed", "shocked"],
  },
  {
    shortcode: "flushed",
    emoji: "😳",
    aliases: ["embarrassed"],
    keywords: ["blush", "shocked"],
  },
  {
    shortcode: "pleading_face",
    emoji: "🥺",
    aliases: ["pleading", "puppy_eyes"],
    keywords: ["please", "cute", "sad"],
  },
  {
    shortcode: "cry",
    emoji: "😢",
    keywords: ["sad", "tear"],
  },
  {
    shortcode: "sob",
    emoji: "😭",
    aliases: ["crying"],
    keywords: ["sad", "tears", "bawling"],
  },
  {
    shortcode: "scream",
    emoji: "😱",
    aliases: ["omg"],
    keywords: ["shock", "scared", "fear"],
  },
  {
    shortcode: "disappointed",
    emoji: "😞",
    keywords: ["sad", "letdown"],
  },
  {
    shortcode: "sweat",
    emoji: "😓",
    keywords: ["stressed", "hard_work"],
  },
  {
    shortcode: "tired_face",
    emoji: "😫",
    aliases: ["tired", "exhausted"],
    keywords: ["weary"],
  },
  {
    shortcode: "triumph",
    emoji: "😤",
    aliases: ["huff"],
    keywords: ["frustrated", "proud"],
  },
  {
    shortcode: "angry",
    emoji: "😠",
    aliases: ["mad"],
    keywords: ["annoyed", "grumpy"],
  },
  {
    shortcode: "rage",
    emoji: "😡",
    aliases: ["furious"],
    keywords: ["angry", "mad"],
  },
  {
    shortcode: "cursing_face",
    emoji: "🤬",
    aliases: ["swearing"],
    keywords: ["angry", "mad"],
  },
  {
    shortcode: "exploding_head",
    emoji: "🤯",
    aliases: ["mind_blown", "mindblown"],
    keywords: ["shocked", "amazed", "boom"],
  },
  {
    shortcode: "partying_face",
    emoji: "🥳",
    aliases: ["celebrate"],
    keywords: ["party", "birthday", "woohoo"],
  },
  {
    shortcode: "smiling_face_with_tear",
    emoji: "🥲",
    aliases: ["happy_cry"],
    keywords: ["touched", "bittersweet"],
  },
  {
    shortcode: "hot_face",
    emoji: "🥵",
    keywords: ["heat", "sweating"],
  },
  {
    shortcode: "cold_face",
    emoji: "🥶",
    aliases: ["freezing"],
    keywords: ["cold", "ice"],
  },
  {
    shortcode: "nauseated_face",
    emoji: "🤢",
    aliases: ["sick"],
    keywords: ["gross", "ill"],
  },
  {
    shortcode: "mask",
    emoji: "😷",
    keywords: ["sick", "doctor"],
  },
  {
    shortcode: "clown_face",
    emoji: "🤡",
    aliases: ["clown"],
    keywords: ["silly", "joke"],
  },
  {
    shortcode: "smiling_imp",
    emoji: "😈",
    aliases: ["devil"],
    keywords: ["evil", "mischief"],
  },
  {
    shortcode: "skull",
    emoji: "💀",
    aliases: ["dead"],
    keywords: ["rip", "laugh", "skeleton"],
  },
  {
    shortcode: "poop",
    emoji: "💩",
    aliases: ["hankey", "shit"],
    keywords: ["crap", "funny"],
  },
  {
    shortcode: "ghost",
    emoji: "👻",
    keywords: ["spooky", "halloween"],
  },
  {
    shortcode: "robot",
    emoji: "🤖",
    aliases: ["bot", "ai"],
    keywords: ["agent", "machine"],
  },
  {
    shortcode: "alien",
    emoji: "👽",
    keywords: ["space", "ufo"],
  },
  {
    shortcode: "see_no_evil",
    emoji: "🙈",
    keywords: ["monkey", "oops", "shy"],
  },
  {
    shortcode: "hear_no_evil",
    emoji: "🙉",
    keywords: ["monkey"],
  },
  {
    shortcode: "speak_no_evil",
    emoji: "🙊",
    keywords: ["monkey", "oops"],
  },
  {
    shortcode: "wave",
    emoji: "👋",
    aliases: ["hi", "hello", "bye"],
    keywords: ["greet", "hand"],
  },
  {
    shortcode: "clap",
    emoji: "👏",
    aliases: ["applause", "bravo"],
    keywords: ["congrats", "praise"],
  },
  {
    shortcode: "raised_hands",
    emoji: "🙌",
    aliases: ["hooray", "yay"],
    keywords: ["celebrate", "praise"],
  },
  {
    shortcode: "ok_hand",
    emoji: "👌",
    aliases: ["ok", "nice"],
    keywords: ["perfect", "good"],
  },
  {
    shortcode: "pinched_fingers",
    emoji: "🤌",
    aliases: ["chefs_kiss"],
    keywords: ["italian", "perfect"],
  },
  {
    shortcode: "v",
    emoji: "✌️",
    aliases: ["peace", "victory"],
    keywords: ["hand"],
  },
  {
    shortcode: "crossed_fingers",
    emoji: "🤞",
    aliases: ["fingers_crossed", "luck"],
    keywords: ["hope"],
  },
  {
    shortcode: "handshake",
    emoji: "🤝",
    aliases: ["deal"],
    keywords: ["agree", "partner"],
  },
  {
    shortcode: "muscle",
    emoji: "💪",
    aliases: ["strong", "flex"],
    keywords: ["power", "gym", "got_this"],
  },
  {
    shortcode: "fist",
    emoji: "✊",
    keywords: ["power", "solidarity"],
  },
  {
    shortcode: "punch",
    emoji: "👊",
    aliases: ["fist_bump", "brofist"],
    keywords: ["bump"],
  },
  {
    shortcode: "raised_hand",
    emoji: "✋",
    aliases: ["hand", "stop"],
    keywords: ["high_five"],
  },
  {
    shortcode: "point_up",
    emoji: "☝️",
    keywords: ["this", "actually"],
  },
  {
    shortcode: "point_right",
    emoji: "👉",
    keywords: ["arrow", "direction"],
  },
  {
    shortcode: "point_left",
    emoji: "👈",
    keywords: ["arrow", "direction"],
  },
  {
    shortcode: "point_down",
    emoji: "👇",
    keywords: ["below", "direction"],
  },
  {
    shortcode: "metal",
    emoji: "🤘",
    aliases: ["rock_on"],
    keywords: ["rock", "music"],
  },
  {
    shortcode: "call_me_hand",
    emoji: "🤙",
    aliases: ["call_me", "shaka"],
    keywords: ["chill", "hang_loose"],
  },
  {
    shortcode: "writing_hand",
    emoji: "✍️",
    aliases: ["write"],
    keywords: ["note", "sign"],
  },
  {
    shortcode: "shrug",
    emoji: "🤷",
    aliases: ["dunno", "idk"],
    keywords: ["whatever"],
  },
  {
    shortcode: "facepalm",
    emoji: "🤦",
    aliases: ["doh"],
    keywords: ["smh", "oops"],
  },
  {
    shortcode: "brain",
    emoji: "🧠",
    aliases: ["smart"],
    keywords: ["think", "idea", "mind"],
  },
  {
    shortcode: "broken_heart",
    emoji: "💔",
    keywords: ["sad", "heartbreak"],
  },
  {
    shortcode: "sparkling_heart",
    emoji: "💖",
    keywords: ["love", "sparkle"],
  },
  {
    shortcode: "orange_heart",
    emoji: "🧡",
    keywords: ["love"],
  },
  {
    shortcode: "yellow_heart",
    emoji: "💛",
    keywords: ["love"],
  },
  {
    shortcode: "green_heart",
    emoji: "💚",
    keywords: ["love"],
  },
  {
    shortcode: "blue_heart",
    emoji: "💙",
    keywords: ["love"],
  },
  {
    shortcode: "purple_heart",
    emoji: "💜",
    keywords: ["love"],
  },
  {
    shortcode: "black_heart",
    emoji: "🖤",
    keywords: ["love"],
  },
  {
    shortcode: "white_heart",
    emoji: "🤍",
    keywords: ["love"],
  },
  {
    shortcode: "white_check_mark",
    emoji: "✅",
    aliases: ["check", "done", "checkmark"],
    keywords: ["yes", "complete", "pass", "ok"],
  },
  {
    shortcode: "heavy_check_mark",
    emoji: "✔️",
    keywords: ["done", "check", "yes"],
  },
  {
    shortcode: "x",
    emoji: "❌",
    aliases: ["cross", "cancel", "fail"],
    keywords: ["no", "wrong", "delete"],
  },
  {
    shortcode: "warning",
    emoji: "⚠️",
    aliases: ["warn", "alert"],
    keywords: ["caution", "danger"],
  },
  {
    shortcode: "question",
    emoji: "❓",
    keywords: ["ask", "help", "huh"],
  },
  {
    shortcode: "exclamation",
    emoji: "❗",
    aliases: ["bang", "important"],
    keywords: ["alert", "attention"],
  },
  {
    shortcode: "no_entry",
    emoji: "⛔",
    aliases: ["blocked"],
    keywords: ["stop", "forbidden"],
  },
  {
    shortcode: "stop_sign",
    emoji: "🛑",
    keywords: ["halt", "wait"],
  },
  {
    shortcode: "sparkles",
    emoji: "✨",
    aliases: ["magic", "shiny"],
    keywords: ["clean", "new", "glitter"],
  },
  {
    shortcode: "star",
    emoji: "⭐",
    keywords: ["favorite", "gold", "rating"],
  },
  {
    shortcode: "star2",
    emoji: "🌟",
    aliases: ["glowing_star"],
    keywords: ["bright", "awesome"],
  },
  {
    shortcode: "zap",
    emoji: "⚡",
    aliases: ["lightning", "fast"],
    keywords: ["electric", "bolt", "quick"],
  },
  {
    shortcode: "boom",
    emoji: "💥",
    aliases: ["collision", "explosion"],
    keywords: ["bang", "impact"],
  },
  {
    shortcode: "bulb",
    emoji: "💡",
    aliases: ["idea", "lightbulb"],
    keywords: ["tip", "thought"],
  },
  {
    shortcode: "trophy",
    emoji: "🏆",
    aliases: ["win", "winner"],
    keywords: ["award", "prize", "champion"],
  },
  {
    shortcode: "medal",
    emoji: "🏅",
    keywords: ["award", "win"],
  },
  {
    shortcode: "crown",
    emoji: "👑",
    aliases: ["king", "queen"],
    keywords: ["royal", "best"],
  },
  {
    shortcode: "gem",
    emoji: "💎",
    aliases: ["diamond"],
    keywords: ["precious", "rare"],
  },
  {
    shortcode: "dart",
    emoji: "🎯",
    aliases: ["bullseye", "target"],
    keywords: ["goal", "hit", "exact"],
  },
  {
    shortcode: "gift",
    emoji: "🎁",
    aliases: ["present"],
    keywords: ["birthday", "box"],
  },
  {
    shortcode: "balloon",
    emoji: "🎈",
    keywords: ["party", "birthday"],
  },
  {
    shortcode: "confetti_ball",
    emoji: "🎊",
    keywords: ["party", "celebrate"],
  },
  {
    shortcode: "moneybag",
    emoji: "💰",
    aliases: ["money"],
    keywords: ["cash", "rich", "dollar"],
  },
  {
    shortcode: "chart_with_upwards_trend",
    emoji: "📈",
    aliases: ["stonks", "chart_up"],
    keywords: ["growth", "profit", "up"],
  },
  {
    shortcode: "chart_with_downwards_trend",
    emoji: "📉",
    aliases: ["chart_down"],
    keywords: ["loss", "down"],
  },
  {
    shortcode: "bug",
    emoji: "🐛",
    keywords: ["issue", "defect", "insect"],
  },
  {
    shortcode: "wrench",
    emoji: "🔧",
    aliases: ["fix", "tool"],
    keywords: ["repair", "config"],
  },
  {
    shortcode: "hammer",
    emoji: "🔨",
    aliases: ["build"],
    keywords: ["tool", "work"],
  },
  {
    shortcode: "gear",
    emoji: "⚙️",
    aliases: ["settings"],
    keywords: ["config", "cog"],
  },
  {
    shortcode: "lock",
    emoji: "🔒",
    aliases: ["secure", "private"],
    keywords: ["encrypted", "security"],
  },
  {
    shortcode: "unlock",
    emoji: "🔓",
    keywords: ["open"],
  },
  {
    shortcode: "key",
    emoji: "🔑",
    keywords: ["password", "access", "secret"],
  },
  {
    shortcode: "shield",
    emoji: "🛡️",
    keywords: ["security", "protect"],
  },
  {
    shortcode: "mag",
    emoji: "🔍",
    aliases: ["search"],
    keywords: ["find", "inspect", "zoom"],
  },
  {
    shortcode: "link",
    emoji: "🔗",
    keywords: ["url", "chain", "connect"],
  },
  {
    shortcode: "pushpin",
    emoji: "📌",
    aliases: ["pin"],
    keywords: ["important", "save"],
  },
  {
    shortcode: "memo",
    emoji: "📝",
    aliases: ["note", "notes"],
    keywords: ["write", "doc", "edit"],
  },
  {
    shortcode: "clipboard",
    emoji: "📋",
    keywords: ["copy", "paste", "list"],
  },
  {
    shortcode: "package",
    emoji: "📦",
    aliases: ["box", "release"],
    keywords: ["ship", "npm", "deliver"],
  },
  {
    shortcode: "envelope",
    emoji: "✉️",
    aliases: ["email", "mail"],
    keywords: ["message", "letter"],
  },
  {
    shortcode: "bell",
    emoji: "🔔",
    aliases: ["notification", "ping"],
    keywords: ["alert", "ring"],
  },
  {
    shortcode: "mega",
    emoji: "📣",
    aliases: ["announce", "megaphone"],
    keywords: ["news", "shout"],
  },
  {
    shortcode: "speech_balloon",
    emoji: "💬",
    aliases: ["chat", "comment"],
    keywords: ["talk", "message"],
  },
  {
    shortcode: "calendar",
    emoji: "📅",
    aliases: ["date", "schedule"],
    keywords: ["event", "meeting"],
  },
  {
    shortcode: "clock",
    emoji: "🕐",
    aliases: ["time"],
    keywords: ["schedule", "wait"],
  },
  {
    shortcode: "hourglass",
    emoji: "⏳",
    aliases: ["waiting", "loading"],
    keywords: ["time", "soon"],
  },
  {
    shortcode: "alarm_clock",
    emoji: "⏰",
    aliases: ["alarm"],
    keywords: ["wake", "deadline", "reminder"],
  },
  {
    shortcode: "stopwatch",
    emoji: "⏱️",
    aliases: ["timer"],
    keywords: ["fast", "benchmark"],
  },
  {
    shortcode: "laptop",
    emoji: "💻",
    aliases: ["computer", "code"],
    keywords: ["dev", "work", "mac"],
  },
  {
    shortcode: "keyboard",
    emoji: "⌨️",
    keywords: ["type", "shortcut"],
  },
  {
    shortcode: "phone",
    emoji: "📱",
    aliases: ["mobile"],
    keywords: ["iphone", "call"],
  },
  {
    shortcode: "camera",
    emoji: "📷",
    aliases: ["photo"],
    keywords: ["picture", "snap"],
  },
  {
    shortcode: "headphones",
    emoji: "🎧",
    keywords: ["music", "audio", "listen"],
  },
  {
    shortcode: "microphone",
    emoji: "🎤",
    aliases: ["mic"],
    keywords: ["voice", "sing", "record"],
  },
  {
    shortcode: "musical_note",
    emoji: "🎵",
    aliases: ["music"],
    keywords: ["song", "melody"],
  },
  {
    shortcode: "video_game",
    emoji: "🎮",
    aliases: ["game", "gaming"],
    keywords: ["play", "controller"],
  },
  {
    shortcode: "art",
    emoji: "🎨",
    aliases: ["design"],
    keywords: ["paint", "creative"],
  },
  {
    shortcode: "book",
    emoji: "📖",
    aliases: ["read", "docs"],
    keywords: ["study", "learn"],
  },
  {
    shortcode: "books",
    emoji: "📚",
    aliases: ["library"],
    keywords: ["read", "study"],
  },
  {
    shortcode: "coffee",
    emoji: "☕",
    aliases: ["cafe"],
    keywords: ["morning", "drink", "tea"],
  },
  {
    shortcode: "beer",
    emoji: "🍺",
    aliases: ["cheers"],
    keywords: ["drink", "pub"],
  },
  {
    shortcode: "wine_glass",
    emoji: "🍷",
    aliases: ["wine"],
    keywords: ["drink"],
  },
  {
    shortcode: "champagne",
    emoji: "🍾",
    keywords: ["celebrate", "party", "cheers"],
  },
  {
    shortcode: "clinking_glasses",
    emoji: "🥂",
    aliases: ["toast"],
    keywords: ["cheers", "celebrate"],
  },
  {
    shortcode: "pizza",
    emoji: "🍕",
    keywords: ["food", "dinner", "lunch"],
  },
  {
    shortcode: "hamburger",
    emoji: "🍔",
    aliases: ["burger"],
    keywords: ["food", "lunch"],
  },
  {
    shortcode: "taco",
    emoji: "🌮",
    keywords: ["food", "mexican"],
  },
  {
    shortcode: "sushi",
    emoji: "🍣",
    keywords: ["food", "japanese"],
  },
  {
    shortcode: "ramen",
    emoji: "🍜",
    keywords: ["food", "noodles"],
  },
  {
    shortcode: "cake",
    emoji: "🎂",
    aliases: ["birthday"],
    keywords: ["dessert", "party"],
  },
  {
    shortcode: "cookie",
    emoji: "🍪",
    keywords: ["snack", "sweet"],
  },
  {
    shortcode: "popcorn",
    emoji: "🍿",
    keywords: ["movie", "drama", "watch"],
  },
  {
    shortcode: "sunny",
    emoji: "☀️",
    aliases: ["sun"],
    keywords: ["weather", "bright", "morning"],
  },
  {
    shortcode: "crescent_moon",
    emoji: "🌙",
    aliases: ["moon"],
    keywords: ["night", "dark", "sleep"],
  },
  {
    shortcode: "rainbow",
    emoji: "🌈",
    keywords: ["pride", "colors", "weather"],
  },
  {
    shortcode: "cloud",
    emoji: "☁️",
    keywords: ["weather", "sky"],
  },
  {
    shortcode: "snowflake",
    emoji: "❄️",
    aliases: ["snow", "cold"],
    keywords: ["winter", "ice"],
  },
  {
    shortcode: "ocean",
    emoji: "🌊",
    aliases: ["water"],
    keywords: ["sea", "surf", "beach"],
  },
  {
    shortcode: "earth_americas",
    emoji: "🌎",
    aliases: ["globe", "world", "earth"],
    keywords: ["planet", "global"],
  },
  {
    shortcode: "seedling",
    emoji: "🌱",
    aliases: ["plant", "grow"],
    keywords: ["nature", "spring", "new"],
  },
  {
    shortcode: "rose",
    emoji: "🌹",
    aliases: ["flower"],
    keywords: ["love", "romance"],
  },
  {
    shortcode: "four_leaf_clover",
    emoji: "🍀",
    aliases: ["clover", "lucky"],
    keywords: ["luck", "green"],
  },
  {
    shortcode: "cat",
    emoji: "🐱",
    aliases: ["kitty"],
    keywords: ["pet", "animal"],
  },
  {
    shortcode: "dog",
    emoji: "🐶",
    aliases: ["puppy"],
    keywords: ["pet", "animal"],
  },
  {
    shortcode: "unicorn",
    emoji: "🦄",
    keywords: ["magic", "rare", "startup"],
  },
  {
    shortcode: "bee",
    emoji: "🐝",
    keywords: ["busy", "buzz"],
  },
  {
    shortcode: "butterfly",
    emoji: "🦋",
    keywords: ["nature", "pretty"],
  },
  {
    shortcode: "turtle",
    emoji: "🐢",
    aliases: ["slow"],
    keywords: ["animal"],
  },
  {
    shortcode: "penguin",
    emoji: "🐧",
    aliases: ["linux"],
    keywords: ["bird", "cold"],
  },
  {
    shortcode: "owl",
    emoji: "🦉",
    keywords: ["night", "wise"],
  },
  {
    shortcode: "car",
    emoji: "🚗",
    keywords: ["drive", "travel"],
  },
  {
    shortcode: "airplane",
    emoji: "✈️",
    aliases: ["flight", "plane"],
    keywords: ["travel", "trip"],
  },
  {
    shortcode: "house",
    emoji: "🏠",
    aliases: ["home"],
    keywords: ["wfh", "building"],
  },
  {
    shortcode: "checkered_flag",
    emoji: "🏁",
    aliases: ["finish"],
    keywords: ["done", "race"],
  },
  {
    shortcode: "red_circle",
    emoji: "🔴",
    keywords: ["dot", "status", "live"],
  },
  {
    shortcode: "green_circle",
    emoji: "🟢",
    keywords: ["dot", "status", "online"],
  },
  {
    shortcode: "yellow_circle",
    emoji: "🟡",
    keywords: ["dot", "status", "away"],
  },
  {
    shortcode: "blue_circle",
    emoji: "🔵",
    keywords: ["dot", "status"],
  },
  {
    shortcode: "recycle",
    emoji: "♻️",
    keywords: ["refactor", "reuse"],
  },
  {
    shortcode: "arrows_counterclockwise",
    emoji: "🔄",
    aliases: ["refresh", "sync"],
    keywords: ["reload", "repeat"],
  },
  {
    shortcode: "arrow_up",
    emoji: "⬆️",
    keywords: ["up"],
  },
  {
    shortcode: "arrow_down",
    emoji: "⬇️",
    keywords: ["down"],
  },
  {
    shortcode: "arrow_left",
    emoji: "⬅️",
    keywords: ["left"],
  },
  {
    shortcode: "arrow_right",
    emoji: "➡️",
    keywords: ["right"],
  },
  {
    shortcode: "heavy_plus_sign",
    emoji: "➕",
    aliases: ["plus"],
    keywords: ["add"],
  },
  {
    shortcode: "heavy_minus_sign",
    emoji: "➖",
    aliases: ["minus"],
    keywords: ["subtract"],
  },
];

const emojiLookupMap: ReadonlyMap<string, string> = new Map(
  emojiCatalog.flatMap((entry) => [
    [entry.shortcode.toLowerCase(), entry.emoji] as const,
    ...(entry.aliases ?? []).map((alias) =>
      [alias.toLowerCase(), entry.emoji] as const
    ),
  ]),
);

export const lookupEmoji = (shortcode: string): string | undefined =>
  emojiLookupMap.get(shortcode.toLowerCase());

const scoreEmojiEntry = (query: string) => (entry: EmojiEntry): number => {
  const code = entry.shortcode.toLowerCase();
  const aliases = (entry.aliases ?? []).map((a) => a.toLowerCase());
  const keywords = (entry.keywords ?? []).map((k) => k.toLowerCase());
  if (code === query) return 0;
  if (aliases.includes(query)) return 1;
  if (code.startsWith(query)) return 2;
  if (aliases.some((a) => a.startsWith(query))) return 3;
  if (keywords.some((k) => k.startsWith(query))) return 4;
  if (code.includes(query) || aliases.some((a) => a.includes(query))) return 5;
  if (keywords.some((k) => k.includes(query))) return 6;
  return -1;
};

export const searchEmojis = (
  filter: string,
  limit = 8,
): EmojiEntry[] => {
  const query = filter.trim().toLowerCase();
  if (!query) return emojiCatalog.slice(0, limit);
  return emojiCatalog
    .map((entry, index) => ({
      entry,
      score: scoreEmojiEntry(query)(entry),
      index,
    }))
    .filter(({ score }) => score >= 0)
    .sort((a, b) => a.score - b.score || a.index - b.index)
    .slice(0, limit)
    .map(({ entry }) => entry);
};

const shortcodeTokenPattern = /^[a-z0-9_+-]+$/i;

const reactionPrefixMode = (
  textBeforeCursor: string,
  colonIndex: number,
): ReactionMode | null => {
  if (colonIndex !== 1) return null;
  if (textBeforeCursor[0] === "+") return "add";
  if (textBeforeCursor[0] === "-") return "remove";
  return null;
};

const hasValidColonBoundary = (
  textBeforeCursor: string,
  colonIndex: number,
): boolean =>
  colonIndex === 0 ||
  /\s/.test(textBeforeCursor[colonIndex - 1]) ||
  reactionPrefixMode(textBeforeCursor, colonIndex) !== null;

export const getEmojiAutocompleteState = (
  text: string,
  cursorIndex: number,
): EmojiAutocompleteMatch | null => {
  const textBeforeCursor = text.slice(0, cursorIndex);
  const colonIndex = textBeforeCursor.lastIndexOf(":");
  if (colonIndex === -1) return null;
  if (!hasValidColonBoundary(textBeforeCursor, colonIndex)) return null;
  const filter = textBeforeCursor.slice(colonIndex + 1);
  const reactionMode = reactionPrefixMode(textBeforeCursor, colonIndex);
  if (filter.length === 0) {
    return reactionMode
      ? { triggerIndex: colonIndex, filter, reactionMode }
      : null;
  }
  if (!shortcodeTokenPattern.test(filter)) return null;
  return { triggerIndex: colonIndex, filter, reactionMode };
};

export const insertEmoji = (
  text: string,
  triggerIndex: number,
  cursorIndex: number,
  emoji: string,
  reactionMode: ReactionMode | null,
) => {
  const insertion = reactionMode ? emoji : `${emoji} `;
  return {
    newText: text.slice(0, triggerIndex) + insertion + text.slice(cursorIndex),
    newCursorIndex: triggerIndex + insertion.length,
  };
};

export const convertCompletedShortcodeAtCursor = (
  text: string,
  cursorIndex: number,
): { text: string; cursorIndex: number } | null => {
  if (cursorIndex < 3) return null;
  const textBeforeCursor = text.slice(0, cursorIndex);
  if (!textBeforeCursor.endsWith(":")) return null;
  const startIndex = textBeforeCursor.lastIndexOf(
    ":",
    textBeforeCursor.length - 2,
  );
  if (startIndex === -1) return null;
  if (!hasValidColonBoundary(textBeforeCursor, startIndex)) return null;
  const shortcode = textBeforeCursor.slice(startIndex + 1, -1);
  if (!shortcode || !shortcodeTokenPattern.test(shortcode)) return null;
  const emoji = lookupEmoji(shortcode);
  if (!emoji) return null;
  return {
    text: text.slice(0, startIndex) + emoji + text.slice(cursorIndex),
    cursorIndex: startIndex + emoji.length,
  };
};

const replaceShortcodesInPlainSegment = (segment: string): string =>
  segment.replace(
    /(^|[\s]|[+-](?=:))(:([a-z0-9_+-]+):)/gi,
    (full, prefix: string, token: string, code: string, offset: number) => {
      if ((prefix === "+" || prefix === "-") && offset !== 0) return full;
      const emoji = lookupEmoji(code);
      return emoji ? `${prefix}${emoji}` : `${prefix}${token}`;
    },
  );

export const replaceEmojiShortcodes = (text: string): string =>
  text
    .split(/(```[\s\S]*?```|`[^`\n]+`)/g)
    .map((part, index) =>
      index % 2 === 1 ? part : replaceShortcodesInPlainSegment(part)
    )
    .join("");

const singleEmojiPattern =
  /^(?:(?:\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier})*(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier})*)*)|(?:[\u{1F1E6}-\u{1F1FF}]{2})|(?:[0-9#*]\uFE0F?\u20E3))$/u;

export const parseReactionCommand = (
  text: string,
): { emoji: string; remove: boolean } | null => {
  const trimmed = text.trim();
  if (trimmed.length < 2) return null;
  const prefix = trimmed[0];
  if (prefix !== "+" && prefix !== "-") return null;
  const remove = prefix === "-";
  const body = trimmed.slice(1).trim();
  if (!body) return null;
  const shortcodeMatch = body.match(/^:([a-z0-9_+-]+):?$/i);
  if (shortcodeMatch) {
    const emoji = lookupEmoji(shortcodeMatch[1]);
    return emoji ? { emoji, remove } : null;
  }
  return singleEmojiPattern.test(body) ? { emoji: body, remove } : null;
};
