// UI strings in Kazakh, Russian and English. Kazakh flavour words (toi, tor, kuda...) stay Kazakh in every language.
import { profile, saveProfile } from './storage';

export type Lang = 'kk' | 'ru' | 'en';
export const LANGS: Lang[] = ['kk', 'ru', 'en'];

//      key:        [en, ru, kk]
const D: Record<string, [string, string, string]> = {
  lang: ['ENGLISH', 'РУССКИЙ', 'ҚАЗАҚША'],
  toi: ['TOI', 'ТОЙ', 'ТОЙ'],
  bastar: ['BASTAR!', 'БАСТАР!', 'БАСТАР!'],
  toiBastar: ['TOI BASTAR!', 'ТОЙ БАСТАР!', 'ТОЙ БАСТАР!'],
  subtitle: ['WEDDING SEATING PUZZLE', 'СВАДЕБНАЯ РАССАДКА', 'ТОЙДА ОТЫРҒЫЗУ ОЙЫНЫ'],
  ranking: ['RANKING', 'РЕЙТИНГ', 'РЕЙТИНГ'],
  profile: ['PROFILE', 'ПРОФИЛЬ', 'ПРОФИЛЬ'],
  soundOn: ['SOUND: ON', 'ЗВУК: ДА', 'ДЫБЫС: ИӘ'],
  soundOff: ['SOUND: OFF', 'ЗВУК: НЕТ', 'ДЫБЫС: ЖОҚ'],
  tenge: ['TENGE', 'ТЕҢГЕ', 'ТЕҢГЕ'],
  best: ['BEST', 'РЕКОРД', 'РЕКОРД'],
  help1: ['DRAG GUESTS TO THEIR SEATS', 'РАССАДИ ГОСТЕЙ ПО МЕСТАМ', 'ҚОНАҚТАРДЫ ОРЫНҒА ОТЫРҒЫЗ'],
  help2: ['BEFORE THE ASABA ARRIVES', 'ПОКА НЕ ПРИШЁЛ АСАБА', 'АСАБА КЕЛГЕНШЕ'],

  hall_yurt: ['KIIZ UI', 'ЮРТА', 'КИІЗ ҮЙ'],
  hall_cafe: ['CAFE', 'КАФЕ', 'КАФЕ'],
  hall_banquet: ['TOIKHANA', 'БАНКЕТ-ЗАЛ', 'ТОЙХАНА'],
  toiN: ['TOI {n}', 'ТОЙ {n}', 'ТОЙ {n}'],
  seats: ['{n} SEATS', '{n} МЕСТ', '{n} ОРЫН'],
  kurmet: ['KURMET', 'ПОЧЁТ', 'ҚҰРМЕТ'],
  scandal: ['SCANDAL', 'СКАНДАЛ', 'ЖАНЖАЛ'],
  rules: ['RULES', 'ПРАВИЛА', 'ЕРЕЖЕ'],
  ok: ['OK', 'ПОНЯТНО', 'ЖАРАЙДЫ'],
  rule1: ['ELDERS SIT IN GOLD SEATS NEAR THE TOR. NO YOUNG GUESTS ON THE TOR ROW.',
    'СТАРШИЕ - НА ЗОЛОТЫЕ МЕСТА У ТОРА. МОЛОДЫМ НА ТОРЕ НЕ МЕСТО.',
    'ҮЛКЕНДЕР - ТӨРГЕ ЖАҚЫН АЛТЫН ОРЫНҒА. ЖАСТАР ТӨРГЕ ОТЫРМАЙДЫ.'],
  rule2: ['GROOM SIDE (BLUE) LEFT, BRIDE SIDE (RED) RIGHT.',
    'СТОРОНА ЖЕНИХА (СИНИЕ) СЛЕВА, НЕВЕСТЫ (КРАСНЫЕ) СПРАВА.',
    'КҮЙЕУ ЖАҒЫ (КӨК) СОЛДА, ҚЫЗ ЖАҒЫ (ҚЫЗЫЛ) ОҢДА.'],
  rule3: ['KUDA (RING) IN GOLD SEATS, FACING THEIR PAIR.',
    'КУДА (КОЛЬЦО) - НА ЗОЛОТЫЕ МЕСТА, НАПРОТИВ СВОЕЙ ПАРЫ.',
    'ҚҰДАЛАР (САҚИНА) - АЛТЫН ОРЫНҒА, ЖҰБЫНА ҚАРСЫ.'],
  rule4: ['BOLT = FEUD. KEEP THEM APART.', 'МОЛНИЯ = ССОРА. НЕ САЖАЙ РЯДОМ.', 'НАЙЗАҒАЙ = АРАЗДЫҚ. ҚАТАР ОТЫРҒЫЗБА.'],
  rule5: ['CHILDREN IN GREEN SEATS BY THE DOOR.', 'ДЕТИ - НА ЗЕЛЁНЫЕ МЕСТА У ДВЕРИ.', 'БАЛАЛАР - ЕСІК ЖАҚТАҒЫ ЖАСЫЛ ОРЫНҒА.'],
  surprise: ['SURPRISE GUEST INCOMING!', 'ЖДИ НЕЖДАННОГО ГОСТЯ!', 'КҮТПЕГЕН ҚОНАҚ КЕЛЕДІ!'],
  dragHelp: ['DRAG GUESTS TO SEATS. DRAG SEATED ONES TO SWAP.',
    'ТАЩИ ГОСТЕЙ НА МЕСТА. СИДЯЩИХ МОЖНО МЕНЯТЬ.',
    'ҚОНАҚТЫ ОРЫНҒА СҮЙРЕ. ОТЫРҒАНДАРДЫ АУЫСТЫРУҒА БОЛАДЫ.'],

  groom: ['GROOM', 'ЖЕНИХ', 'КҮЙЕУ'],
  bride: ['BRIDE', 'НЕВЕСТА', 'ҚЫЗ'],
  tor: ['TOR', 'ТӨР', 'ТӨР'],
  door: ['DOOR', 'ВХОД', 'ЕСІК'],
  estelygi: ['TOI ESTELYGI', 'ТОЙ ЕСТЕЛІГІ', 'ТОЙ ЕСТЕЛІГІ'],

  akimCame: ['OIBAI! AKIM KELDI!', 'ОЙБАЙ! ӘКІМ КЕЛДІ!', 'ОЙБАЙ! ӘКІМ КЕЛДІ!'],
  asabaCame: ['ASABA KELDI!', 'АСАБА ПРИШЁЛ!', 'АСАБА КЕЛДІ!'],
  zharaysyn: ['ZHARAYSYN!', 'ЖАРАЙСЫҢ!', 'ЖАРАЙСЫҢ!'],
  oibai: ['OIBAI!', 'ОЙБАЙ!', 'ОЙБАЙ!'],
  offended: ['OFFENDED!', 'ОБИДЕЛСЯ!', 'РЕНЖІДІ!'],
  kudalar: ['KUDALAR! +10', 'ҚҰДАЛАР! +10', 'ҚҰДАЛАР! +10'],
  seatTaken: ['SEAT TAKEN!', 'МЕСТО ЗАНЯТО!', 'ОРЫН БОС ЕМЕС!'],
  fast: ['FAST! +{n}', 'БЫСТРО! +{n}', 'ТЕЗ! +{n}'],

  r_side: ['WRONG SIDE!', 'НЕ ТА СТОРОНА!', 'ҚАТЕ ЖАҚ!'],
  r_elder: ['ELDER TOO FAR FROM TOR!', 'СТАРШИЙ ДАЛЕКО ОТ ТОРА!', 'ҮЛКЕН ТӨРДЕН АЛЫС!'],
  r_tor: ['TOR ROW IS FOR ELDERS!', 'ТӨР - ДЛЯ СТАРШИХ!', 'ТӨР - ҮЛКЕНДЕРГЕ!'],
  r_kuda: ['KUDA NEED A GOLD SEAT!', 'КУДА НУЖНО ЗОЛОТОЕ МЕСТО!', 'ҚҰДАҒА АЛТЫН ОРЫН!'],
  r_face: ['KUDA MUST FACE EACH OTHER!', 'КУДА - ДРУГ НАПРОТИВ ДРУГА!', 'ҚҰДАЛАР ҚАРСЫ ОТЫРСЫН!'],
  r_feud: ['FEUD! THEY ARE FIGHTING!', 'ССОРА! ОНИ ПОРУГАЛИСЬ!', 'АРАЗДАР ҚАТАР ОТЫР!'],
  r_child: ['CHILDREN SIT BY THE DOOR!', 'ДЕТИ - У ДВЕРИ!', 'БАЛАЛАР - ЕСІК ЖАҚҚА!'],
  r_akim: ['AKIM BELONGS ON THE TOR!', 'АКИМУ - МЕСТО НА ТӨРЕ!', 'ӘКІМ - ТӨРГЕ!'],

  sideGroom: ['GROOM SIDE', 'ЖЕНИХ', 'КҮЙЕУ ЖАҒЫ'],
  sideBride: ['BRIDE SIDE', 'НЕВЕСТА', 'ҚЫЗ ЖАҒЫ'],
  sideAny: ['ANY SIDE', 'ЛЮБАЯ', 'КЕЗ КЕЛГЕН'],
  h_akim: ['VIP: TOR ROW, ANY SIDE!', 'VIP: НА ТӨР, ЛЮБАЯ СТОРОНА', 'VIP: ТӨРГЕ, КЕЗ КЕЛГЕН ЖАҚ'],
  h_elder: ['ELDER: GOLD SEAT', 'СТАРШИЙ: ЗОЛОТОЕ МЕСТО', 'ҮЛКЕН: АЛТЫН ОРЫН'],
  h_kuda: ['KUDA #{n}: GOLD, FACE PAIR', 'КУДА #{n}: НАПРОТИВ ПАРЫ', 'ҚҰДА #{n}: ЖҰБЫНА ҚАРСЫ'],
  h_child: ['CHILD: GREEN SEAT BY DOOR', 'РЕБЁНОК: ЗЕЛЁНОЕ У ДВЕРИ', 'БАЛА: ЕСІК ЖАНЫНДА'],
  h_feud: ['FEUD #{n}: KEEP APART!', 'ССОРА #{n}: НЕ РЯДОМ!', 'АРАЗДЫҚ #{n}: БӨЛЕК!'],
  h_guest: ['GUEST: NOT ON TOR ROW', 'ГОСТЬ: НЕ НА ТӨР', 'ҚОНАҚ: ТӨРГЕ ЕМЕС'],
  coming: ['GUESTS ARE COMING...', 'ГОСТИ ИДУТ...', 'ҚОНАҚТАР КЕЛЕ ЖАТЫР...'],

  shashu: ['SHASHU!', 'ШАШУ!', 'ШАШУ!'],
  tapSweets: ['TAP THE SWEETS!', 'ЛОВИ СЛАДОСТИ!', 'ТӘТТІНІ ҰСТА!'],
  kempitPlus: ['KEMPIT +{n}', 'КОНФЕТЫ +{n}', 'КӘМПИТ +{n}'],
  tengePlus: ['TENGE +{n}', 'ТЕҢГЕ +{n}', 'ТЕҢГЕ +{n}'],
  tengeN: ['{n} TENGE', '{n} ТЕҢГЕ', '{n} ТЕҢГЕ'],
  tokenNote1: ['TENGE IS THE TOI TOKEN.', 'ТЕҢГЕ - ТОКЕН ИГРЫ.', 'ТЕҢГЕ - ОЙЫН ТОКЕНІ.'],
  tokenNote2: ['SEE IT IN YOUR PROFILE.', 'СМОТРИ В ПРОФИЛЕ.', 'ПРОФИЛЬДЕН ҚАРА.'],
  nextToi: ['NEXT TOI', 'СЛЕДУЮЩИЙ ТОЙ', 'КЕЛЕСІ ТОЙ'],

  result: ['RESULT', 'ИТОГИ', 'НӘТИЖЕСІ'],
  title0: ['TOI BUZYLDY!', 'ТОЙ БҰЗЫЛДЫ!', 'ТОЙ БҰЗЫЛДЫ!'],
  title1: ['ZHAMAN TOISHY', 'ЖАМАН ТОЙШЫ', 'ЖАМАН ТОЙШЫ'],
  title2: ['ZHAKSY TOISHY', 'ЖАҚСЫ ТОЙШЫ', 'ЖАҚСЫ ТОЙШЫ'],
  title3: ['ULY TOISHY', 'ҰЛЫ ТОЙШЫ', 'ҰЛЫ ТОЙШЫ'],
  seatedWell: ['SEATED WELL', 'РАССАЖЕНО ВЕРНО', 'ДҰРЫС ОТЫРДЫ'],
  leftOffended: ['LEFT OFFENDED', 'УШЛИ С ОБИДОЙ', 'РЕНЖІП КЕТТІ'],
  score: ['SCORE', 'ОЧКИ', 'ҰПАЙ'],
  estelygiSaved: ['TOI ESTELYGI SAVED!', 'ТОЙ ЕСТЕЛІГІ СОХРАНЕНО!', 'ТОЙ ЕСТЕЛІГІ САҚТАЛДЫ!'],
  guestsWentHome: ['THE GUESTS WENT HOME...', 'ГОСТИ РАЗОШЛИСЬ...', 'ҚОНАҚТАР ТАРАП КЕТТІ...'],
  starsUnlock: ['3 STARS UNLOCK THE NFT', '3 ЗВЕЗДЫ ОТКРЫВАЮТ NFT', '3 ЖҰЛДЫЗ NFT АШАДЫ'],
  retry: ['RETRY', 'ЗАНОВО', 'ҚАЙТА'],
  menu: ['MENU', 'МЕНЮ', 'МӘЗІР'],
  finish: ['FINISH', 'ЗАВЕРШИТЬ', 'АЯҚТАУ'],
  mint: ['MINT NFT', 'ВЫПУСТИТЬ NFT', 'NFT ШЫҒАРУ'],
  needWallet: ['CONNECT A WALLET IN PROFILE', 'ПОДКЛЮЧИ КОШЕЛЁК В ПРОФИЛЕ', 'ӘМИЯНДЫ ПРОФИЛЬДЕ ҚОС'],
  signing: ['SIGN IN YOUR WALLET...', 'ПОДПИШИ В КОШЕЛЬКЕ...', 'ӘМИЯНДА ҚОЛ ҚОЙ...'],
  minted: ['MINTED! {n}', 'ГОТОВО! {n}', 'ДАЙЫН! {n}'],
  mintOffline: ['SIGNED. MINT SERVICE OFFLINE', 'ПОДПИСАНО. МИНТ НЕДОСТУПЕН', 'ҚОЛ ҚОЙЫЛДЫ. МИНТ ЖОҚ'],
  mintFailed: ['MINT FAILED', 'ОШИБКА МИНТА', 'МИНТ ҚАТЕСІ'],

  over: ['IS OVER!', 'ОКОНЧЕН!', 'БІТТІ!'],
  kempit: ['KEMPIT', 'КОНФЕТЫ', 'КӘМПИТ'],
  tengeEarned: ['TENGE EARNED', 'ТЕҢГЕ ПОЛУЧЕНО', 'ТАБЫЛҒАН ТЕҢГЕ'],
  totalScore: ['TOTAL SCORE', 'ВСЕГО ОЧКОВ', 'ЖАЛПЫ ҰПАЙ'],
  newBest: ['NEW BEST!', 'НОВЫЙ РЕКОРД!', 'ЖАҢА РЕКОРД!'],
  newToi: ['NEW TOI', 'НОВЫЙ ТОЙ', 'ЖАҢА ТОЙ'],

  bestToishy: ['BEST TOISHY', 'ЛУЧШИЕ ТОЙШЫ', 'ҮЗДІК ТОЙШЫЛАР'],
  loading: ['LOADING...', 'ЗАГРУЗКА...', 'ЖҮКТЕЛУДЕ...'],
  emptyBoard: ['NO TOI YET. BE THE FIRST!', 'ПОКА ПУСТО. БУДЬ ПЕРВЫМ!', 'ӘЗІРГЕ БОС. БІРІНШІ БОЛ!'],
  offline: ['OFFLINE: THIS DEVICE ONLY', 'ОФЛАЙН: ТОЛЬКО ЭТОТ ТЕЛЕФОН', 'ОФЛАЙН: ТЕК ОСЫ ҚҰРЫЛҒЫ'],
  back: ['BACK', 'НАЗАД', 'АРТҚА'],

  edit: ['EDIT', 'ИМЯ', 'ӨЗГЕРТ'],
  tengeToken: ['TENGE (TOKEN)', 'ТЕҢГЕ (ТОКЕН)', 'ТЕҢГЕ (ТОКЕН)'],
  bestScore: ['BEST SCORE', 'РЕКОРД', 'РЕКОРД'],
  stars: ['STARS', 'ЗВЁЗДЫ', 'ЖҰЛДЫЗДАР'],
  toisHosted: ['TOIS HOSTED', 'ПРОВЕДЕНО ТОЕВ', 'ӨТКЕН ТОЙЛАР'],
  wallet: ['SOLANA WALLET', 'КОШЕЛЁК SOLANA', 'SOLANA ӘМИЯНЫ'],
  disconnect: ['DISCONNECT', 'ОТКЛЮЧИТЬ', 'АЖЫРАТУ'],
  connecting: ['CONNECTING...', 'ПОДКЛЮЧЕНИЕ...', 'ҚОСЫЛУДА...'],
  connected: ['CONNECTED!', 'ПОДКЛЮЧЕНО!', 'ҚОСЫЛДЫ!'],
  openingWallet: ['OPENING WALLET APP...', 'ОТКРЫВАЮ КОШЕЛЁК...', 'ӘМИЯН АШЫЛУДА...'],
  rejected: ['CONNECTION REJECTED', 'ПОДКЛЮЧЕНИЕ ОТКЛОНЕНО', 'ҚОСЫЛУ ТОҚТАТЫЛДЫ'],
  noMementos: ['GET 3 STARS IN A TOI TO EARN A TABLE SNAPSHOT YOU CAN MINT.',
    'ПОЛУЧИ 3 ЗВЕЗДЫ - СОХРАНИ СНИМОК СТОЛА И ВЫПУСТИ NFT.',
    '3 ЖҰЛДЫЗ АЛ - ДАСТАРХАН СУРЕТІН САҚТАП, NFT ШЫҒАР.'],
  mintedTag: ['MINTED', 'NFT ГОТОВ', 'NFT ДАЙЫН'],
  signedTag: ['SIGNED', 'ПОДПИСАН', 'ҚОЛ ҚОЙЫЛДЫ'],
};

function detect(): Lang {
  const l = (navigator.language || '').toLowerCase();
  return l.startsWith('kk') ? 'kk' : l.startsWith('ru') ? 'ru' : 'en';
}

export let lang: Lang = (profile.lang as Lang) || detect();

export function setLang(l: Lang) {
  lang = l;
  profile.lang = l;
  saveProfile();
}

export function nextLang() {
  setLang(LANGS[(LANGS.indexOf(lang) + 1) % LANGS.length]);
}

export function t(key: string, n?: string | number): string {
  const row = D[key];
  if (!row) return key;
  const s = row[lang === 'en' ? 0 : lang === 'ru' ? 1 : 2];
  return n === undefined ? s : s.replace('{n}', String(n));
}

const LATIN: Record<string, string> = {
  А: 'A', Ә: 'A', Б: 'B', В: 'V', Г: 'G', Ғ: 'G', Д: 'D', Е: 'E', Ё: 'YO', Ж: 'ZH', З: 'Z', И: 'I', Й: 'Y', К: 'K', Қ: 'K',
  Л: 'L', М: 'M', Н: 'N', Ң: 'N', О: 'O', Ө: 'O', П: 'P', Р: 'R', С: 'S', Т: 'T', У: 'U', Ұ: 'U', Ү: 'U', Ф: 'F', Х: 'KH',
  Һ: 'H', Ц: 'TS', Ч: 'CH', Ш: 'SH', Щ: 'SHCH', Ъ: '', Ы: 'Y', І: 'I', Ь: '', Э: 'E', Ю: 'YU', Я: 'YA',
};

/** Guest names are stored in Kazakh Cyrillic; English mode shows them in Latin. */
export function nm(name: string): string {
  return lang === 'en' ? [...name].map((c) => LATIN[c] ?? c).join('') : name;
}
