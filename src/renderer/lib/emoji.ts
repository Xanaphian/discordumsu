// Seçilmiş emoji seti: "emoji:ad,ek-anahtar" biçiminde.
const RAW: [string, string, string][] = [
  ['smile', 'Yüzler', '😀:grinning,gulme 😃:smiley 😄:smile,gulumseme 😁:grin 😆:laughing 😅:sweat_smile 🤣:rofl,kahkaha 😂:joy,aglayarak-gulme 🙂:slight_smile 🙃:upside_down 😉:wink,goz-kirpma 😊:blush 😇:innocent 🥰:smiling_hearts,ask 😍:heart_eyes 🤩:star_struck 😘:kiss,opucuk 😋:yum 😛:tongue 😜:wink_tongue 🤪:zany 😝:squint_tongue 🤑:money_mouth 🤗:hug,sarilma 🤭:hand_over_mouth 🤫:shush 🤔:thinking,dusunme 🤐:zipper 🤨:raised_eyebrow 😐:neutral 😑:expressionless 😶:no_mouth 😏:smirk 😒:unamused 🙄:eye_roll 😬:grimace 😮‍💨:exhale 🤥:lying 😌:relieved 😔:pensive 😪:sleepy 🤤:drool 😴:sleeping,uyku 😷:mask 🤒:sick 🤕:hurt 🤢:nauseated 🤮:vomit 🥵:hot 🥶:cold 🥴:woozy 😵:dizzy 🤯:exploding_head 🤠:cowboy 🥳:party,parti 😎:sunglasses,havali 🤓:nerd 🧐:monocle 😕:confused 😟:worried 🙁:frown 😮:open_mouth 😯:hushed 😲:astonished 😳:flushed 🥺:pleading 😦:frowning 😧:anguished 😨:fearful 😰:anxious 😥:sad_relieved 😢:cry,aglama 😭:sob 😱:scream 😖:confounded 😣:persevere 😞:disappointed 😓:sweat 😩:weary 😫:tired 🥱:yawn 😤:triumph 😡:rage,kizgin 😠:angry 🤬:cursing 😈:smiling_imp 👿:imp 💀:skull 💩:poop 🤡:clown 👻:ghost 👽:alien 🤖:robot 😺:cat_smile 😹:cat_joy 😻:cat_heart'],
  ['hand', 'İnsanlar', '👋:wave,selam 🤚:raised_back 🖐️:hand_splayed ✋:raised_hand 🖖:vulcan 👌:ok_hand,tamam 🤌:pinched 🤏:pinch ✌️:v 🤞:crossed_fingers 🤟:love_you 🤘:metal 🤙:call_me 👈:point_left 👉:point_right 👆:point_up 👇:point_down ☝️:index_up 👍:thumbsup,+1,begen 👎:thumbsdown,-1 ✊:fist 👊:punch 🤛:left_fist 🤜:right_fist 👏:clap,alkis 🙌:raised_hands 👐:open_hands 🤲:palms_up 🤝:handshake 🙏:pray,lutfen ✍️:writing 💅:nails 💪:muscle,guc 🧠:brain 👀:eyes,bakis 👁️:eye 👅:tongue2 👄:lips 🫶:heart_hands 🧑‍💻:technologist 👨‍🍳:cook 🕵️:detective 🧙:mage 🥷:ninja 🦸:hero 🧟:zombie 🙋:raising_hand 🤷:shrug 🤦:facepalm 🙇:bow 💃:dancer 🕺:man_dancing 🏃:runner 👑:crown'],
  ['heart', 'Kalpler', '❤️:heart,kalp 🧡:orange_heart 💛:yellow_heart 💚:green_heart 💙:blue_heart 💜:purple_heart 🖤:black_heart 🤍:white_heart 🤎:brown_heart 💔:broken_heart ❣️:heart_exclamation 💕:two_hearts 💞:revolving_hearts 💓:heartbeat 💗:heartpulse 💖:sparkling_heart 💘:cupid 💝:gift_heart ❤️‍🔥:heart_on_fire 💯:100 💢:anger 💥:boom 💫:dizzy2 💦:sweat_drops 💨:dash 🕳️:hole 💬:speech 🗯️:anger_bubble 💭:thought 💤:zzz'],
  ['nature', 'Doğa', '🐝:bee,ari,kovan 🍯:honey,bal 🐶:dog,kopek 🐱:cat,kedi 🐭:mouse 🐹:hamster 🐰:rabbit 🦊:fox,tilki 🐻:bear 🐼:panda 🐨:koala 🐯:tiger 🦁:lion 🐮:cow 🐷:pig 🐸:frog 🐵:monkey 🙈:see_no_evil 🙉:hear_no_evil 🙊:speak_no_evil 🐔:chicken 🐧:penguin 🐦:bird 🦅:eagle 🦉:owl 🦇:bat 🐺:wolf,kurt 🐗:boar 🐴:horse 🦄:unicorn 🐛:bug 🦋:butterfly 🐌:snail 🐞:ladybug 🐢:turtle 🐍:snake 🦎:lizard 🐙:octopus 🦑:squid 🦀:crab 🐬:dolphin 🐳:whale 🦈:shark 🐊:crocodile 🦖:t_rex 🐉:dragon 🌵:cactus 🎄:tree_xmas 🌲:evergreen 🌳:tree 🌴:palm 🌱:seedling 🌿:herb 🍀:clover 🍁:maple 🍂:leaves 🌷:tulip,lale 🌹:rose 🌻:sunflower 🌸:blossom 🌙:moon 🌎:earth ⭐:star,yildiz 🌟:star2 ✨:sparkles 🔥:fire,ates ⚡:zap 🌈:rainbow ☀️:sun,gunes ⛅:cloud_sun ☁️:cloud 🌧️:rain ❄️:snowflake,kar ☃️:snowman 🌊:wave_sea'],
  ['food', 'Yiyecek', '🍏:green_apple 🍎:apple,elma 🍐:pear 🍊:orange 🍋:lemon 🍌:banana 🍉:watermelon,karpuz 🍇:grapes 🍓:strawberry 🍒:cherries 🍑:peach 🥭:mango 🍍:pineapple 🥥:coconut 🥝:kiwi 🍅:tomato 🍆:eggplant 🥑:avocado 🌶️:pepper 🌽:corn 🥕:carrot 🧄:garlic 🥔:potato 🥐:croissant 🍞:bread,ekmek 🥨:pretzel 🧀:cheese,peynir 🥚:egg 🍳:cooking 🥞:pancakes 🥓:bacon 🍔:burger 🍟:fries 🍕:pizza 🌭:hotdog 🥪:sandwich 🌮:taco 🌯:burrito 🥙:kebab,doner 🍝:spaghetti 🍜:ramen 🍣:sushi 🍤:shrimp 🍦:icecream 🍩:doughnut 🍪:cookie 🎂:cake,pasta 🍰:shortcake 🧁:cupcake 🍫:chocolate 🍬:candy 🍭:lollipop 🍿:popcorn ☕:coffee,kahve 🍵:tea,cay 🧃:juice 🥤:soda 🍺:beer 🍻:beers 🥂:champagne 🍷:wine 🧉:mate 🧊:ice'],
  ['activity', 'Etkinlik', '⚽:soccer,futbol 🏀:basketball 🏈:football ⚾:baseball 🎾:tennis 🏐:volleyball 🏓:ping_pong 🏸:badminton 🥊:boxing 🥋:martial_arts ⛳:golf 🎣:fishing 🎽:running_shirt 🎿:ski 🛹:skateboard 🏆:trophy,kupa 🥇:first 🥈:second 🥉:third 🏅:medal 🎮:video_game,oyun 🕹️:joystick 🎲:dice 🎯:dart,hedef ♟️:chess 🧩:puzzle 🎨:art 🎬:clapper 🎤:microphone 🎧:headphones 🎼:score 🎹:piano 🥁:drum 🎸:guitar 🎻:violin 🎺:trumpet 🎉:tada,kutlama 🎊:confetti 🎈:balloon 🎁:gift,hediye 🎀:ribbon 🪄:magic_wand 🎟️:ticket'],
  ['travel', 'Seyahat', '🚗:car,araba 🚕:taxi 🚌:bus 🏎️:race_car 🚓:police_car 🚑:ambulance 🚒:fire_engine 🚲:bike 🛵:scooter 🏍️:motorcycle 🚂:train ✈️:airplane,ucak 🚀:rocket,roket 🛸:ufo 🚁:helicopter ⛵:sailboat 🚢:ship ⚓:anchor 🗺️:map 🧭:compass 🏔️:mountain 🌋:volcano 🏕️:camping 🏖️:beach 🏝️:island 🏠:house,ev 🏢:office 🏰:castle 🕌:mosque 🗼:tower 🗽:liberty 🎡:ferris 🎢:roller_coaster 🌃:night 🌉:bridge 🌅:sunrise'],
  ['objects', 'Nesneler', '⌚:watch 📱:phone,telefon 💻:laptop,bilgisayar ⌨️:keyboard 🖥️:desktop 🖱️:mouse2 💾:floppy 💿:cd 📷:camera 🎥:movie_camera 📺:tv 📻:radio 🔋:battery 🔌:plug 💡:bulb,fikir 🔦:flashlight 💸:money_wings 💵:dollar 💰:moneybag,para 💎:gem 🔧:wrench 🔨:hammer ⚙️:gear 🧰:toolbox 🔑:key 🔒:lock 🔓:unlock 🛡️:shield ⚔️:swords 🔮:crystal_ball 💊:pill 🧪:test_tube 📦:package 📫:mailbox 📝:memo,not 📌:pushpin 📎:paperclip ✂️:scissors 📅:calendar 📈:chart_up 📉:chart_down 📊:bar_chart 📚:books 📖:book 🔔:bell 🔕:no_bell 📣:mega 🏷️:label ⏰:alarm ⏳:hourglass 🧲:magnet'],
  ['symbols', 'Semboller', '✅:white_check_mark,tamam ☑️:ballot_check ✔️:check ❌:x,hayir ❎:x_square ➕:plus ➖:minus ➗:divide ✖️:multiply ❓:question,soru ❗:exclamation ‼️:bangbang ⁉️:interrobang ⚠️:warning,uyari 🚫:no_entry ⛔:stop 🔞:18 ♻️:recycle 🔰:beginner 💠:diamond_shape 🔴:red_circle 🟠:orange_circle 🟡:yellow_circle 🟢:green_circle 🔵:blue_circle 🟣:purple_circle ⚫:black_circle ⚪:white_circle 🟥:red_square 🟩:green_square 🟦:blue_square ⬆️:up ⬇️:down ⬅️:left ➡️:right 🔄:repeat 🔁:loop 🆗:ok 🆕:new 🆒:cool 🆓:free 🔝:top 🔜:soon ℹ️:info 🎵:note 🎶:notes ➰:curly_loop 💲:dollar_sign ©️:copyright ®️:registered ™️:tm 🏳️:white_flag 🏴:black_flag 🏁:checkered_flag 🇹🇷:flag_tr,turkiye'],
];

export interface EmojiCat {
  id: string;
  name: string;
  list: { e: string; n: string[] }[];
}

export const EMOJI_CATS: EmojiCat[] = RAW.map(([id, name, s]) => ({
  id,
  name,
  list: s
    .split(' ')
    .filter(Boolean)
    .map((tok) => {
      const i = tok.indexOf(':');
      return { e: tok.slice(0, i), n: tok.slice(i + 1).split(',') };
    }),
}));

const BY_NAME = new Map<string, string>();
for (const c of EMOJI_CATS) for (const x of c.list) for (const n of x.n) if (!BY_NAME.has(n)) BY_NAME.set(n, x.e);

export function emojiByName(n: string) {
  return BY_NAME.get(n.toLowerCase());
}

export function searchEmoji(q: string, limit = 60) {
  // Türkçe harflerle yazılan aramalar da bulsun (ateş → ates, yıldız → yildiz)
  q = q
    .toLocaleLowerCase('tr')
    .replace(/^:/, '')
    .replace(/[çğıöşü]/g, (ch) => ({ ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u' })[ch] as string);
  const out: { e: string; n: string }[] = [];
  if (!q) return out;
  for (const c of EMOJI_CATS)
    for (const x of c.list) {
      const hit = x.n.find((n) => n.startsWith(q)) || x.n.find((n) => n.includes(q));
      if (hit) out.push({ e: x.e, n: hit });
      if (out.length >= limit) return out;
    }
  return out;
}

/** ":smile:" kısa kodlarını gönderirken emojiye çevirir */
export function replaceShortcodes(s: string) {
  return s.replace(/(^|[^\w`]):([a-z0-9_+\-]{2,30}):/g, (m, pre, name) => {
    const e = emojiByName(name);
    return e ? pre + e : m;
  });
}

export const QUICK_REACTIONS = ['👍', '❤️', '😂', '🔥', '🎉', '👀'];
