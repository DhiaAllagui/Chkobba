/**
 * Chkobba Translation Engine
 * Supported Languages: EN (English), FR (French), AR (Tunisian Derja)
 */

const translations = {
  en: {
    // Menu
    slogan: "Play Chkobba anywhere, anytime",
    gameSubtitle: "Tunisian Card Game",
    usernameLabel: "USERNAME",
    cardBackLabel: "CARD BACK",
    langLabel: "LANGUAGE",
    sfxLabel: "Enable Sound Effects",
    playSingle: "Single Player",
    playMulti: "Multiplayer",
    howToPlay: "How to Play",
    
    // Single & Lobby
    singleTitle: "SINGLE PLAYER",
    singleSub: "Game Settings",
    botDiff: "BOT DIFFICULTY",
    targetScore: "TARGET SCORE",
    playBtn: "PLAY CHKOBBA",
    multiTitle: "MULTIPLAYER",
    multiSub: "Play with your friend",
    createParty: "Create a Party",
    createPartySub: "GENERATE A CODE — INVITE YOUR FRIEND",
    joinParty: "Join a Party",
    joinPartySub: "ENTER YOUR FRIEND'S CODE",

    fullscreen: "Fullscreen",
    // Toasts & Alerts
    estanna: "Wait your turn...",
    tableEmpty: "Table is empty",
    yourTurn: "It's your turn!",
    botThinking: "Bot is thinking...",
    // End Screen
    roundOver: "Round Over",
    playAgain: "Next Round",
    mainMenu: "Main Menu",
    matchStatus: "Only {points} points left to become the Sultan!",
    sultan: "{name} has become the Sultan!",
    // Chat menu
    chatTitle: "Quick Chat",
    c1: "Sahha!",
    c2: "CHKOBTEK!",
    c3: "7ayya 3andek?",
    c4: "Chkeyb lee!",
    c5: "T3allem al3eb!",
    c6: "Kesah!",
    c7: "La3ba sehla",
    c8: "Jib dineri",
    c9: "L'7ayya dour",
    c10: "Nrisky?",
    c11: "Eyy",
    c12: "Lee",
    c13: "Yrawah!",
    c14: "Ija beha!",
    c15: "7otni m3ah",
    c16: "narj3ou ayy",
    c17: "Hurry up!",
    c18: "Waiting for next year?",
    bot_7ayya: "Adhika l'7ayya!",
    bot_winning_1: "Malla la3ba!",
    bot_winning_2: "Ma3adech bekri aalik ay!",
    bot_losing: "Mala zhar aandek...",
    bot_idle_1: "7ot kess atay!",
    bot_idle_2: "Dima lenna enty?",
    bot_idle_3: "Tawa hedha la3b?",
    bot_idle_4: "Khamem belgda aad...",
    bot_idle_5: "Vasy al3eb!",
    bot_idle_6: "Aka l9ahwa wini !",
    bot_idle_7: "chorb aalik lyoum?",
    bot_idle_8: "Famech sigarou?",
    bot_idle_9: "tarref ekher wehed rbehni chsarlou?",
    bot_idle_10: "Ya rabi ya rabi!",
    bot_idle_11: "Al3ab w oskot!",
    bot_idle_12: "Zid thabbet, sba7 l khir!",
    bot_chkobba_1: "Hahahaha Chkoba!",
    bot_chkobba_2: "CHKOBAAAAA!",
    bot_chkobba_3: "Rahma leee!",
    // Pause
    paused: "PAUSED",
    resumeGame: "Resume Game",
    quitToMenu: "Quit to Menu",
    // Table Headers
    category: "Category",
    cardsName: "Cards",
    chkobbasName: "Chkobbas"
  },
  fr: {
    slogan: "Joue n'importe où, n'importe quand",
    gameSubtitle: "Jeu de cartes Tunisien",
    usernameLabel: "NOM D'UTILISATEUR",
    cardBackLabel: "DOS DE CARTE",
    langLabel: "LANGUE",
    sfxLabel: "Activer les sons",
    playSingle: "Solo",
    playMulti: "Multijoueur",
    howToPlay: "Comment Jouer",

    singleTitle: "SOLO",
    singleSub: "Paramètres",
    botDiff: "DIFFICULTÉ DU BOT",
    targetScore: "SCORE VISÉ",
    playBtn: "JOUER",
    multiTitle: "MULTIJOUEUR",
    multiSub: "Joue avec ton ami",
    createParty: "Créer une partie",
    createPartySub: "GÉNÉRER UN CODE — INVITER TON AMI",
    joinParty: "Rejoindre",
    joinPartySub: "ENTRER LE CODE",

    fullscreen: "Plein Écran",
    estanna: "Attendez votre tour...",
    tableEmpty: "La table est vide",
    yourTurn: "C'est votre tour!",
    botThinking: "Le bot réfléchit...",
    roundOver: "Fin de la manche",
    playAgain: "Manche Suivante",
    mainMenu: "Menu Principal",
    matchStatus: "Plus que {points} points pour devenir Sultan !",
    sultan: "{name} est devenu le Sultan !",
    chatTitle: "Chat Rapide",
    c1: "Santé !",
    c2: "Je t'ai Chkobba !",
    c3: "T'as le 7ayya ?",
    c4: "Pas de chkobba !",
    c5: "Apprends à jouer !",
    c6: "Chaud devant !",
    c7: "Jeu facile !",
    c8: "Rapporte le dineri",
    c9: "Le 7ayya tourne",
    c10: "On risque ?",
    c11: "Oui",
    c12: "Non",
    c13: "Il rentre chez lui !",
    c14: "Ramène-la !",
    c15: "Mets-moi avec lui",
    c16: "On relance oui",
    c17: "Dépêche-toi !",
    c18: "On attend l'année prochaine ?",
    bot_7ayya: "C'est ça la 7ayya !",
    bot_winning_1: "Quel jeu !",
    bot_winning_2: "C'est déjà fini pour toi !",
    bot_losing: "Quelle chance tu as...",
    bot_idle_1: "Sers-moi un thé !",
    bot_idle_2: "Hé l'ami, concentre-toi !",
    bot_idle_3: "C'est ça que t'appelles jouer ?",
    bot_idle_4: "Réfléchis bien...",
    bot_idle_5: "Vas-y, joue !",
    bot_idle_6: "Et ce café alors ?",
    bot_idle_7: "C'est ta tournée ?",
    bot_idle_8: "T'as pas une clope ?",
    bot_idle_9: "Tu sais ce qui est arrivé au dernier qui m'a battu ?",
    bot_idle_10: "Oh mon Dieu !",
    bot_idle_11: "Joue et tais-toi !",
    bot_idle_12: "Regarde bien... Bonjour hein !",
    bot_chkobba_1: "Hahahaha Chkoba!",
    bot_chkobba_2: "CHKOBAAAAA!",
    bot_chkobba_3: "Rahma leee!",
    paused: "EN PAUSE",
    resumeGame: "Reprendre",
    quitToMenu: "Quitter le jeu",
    category: "Catégorie",
    cardsName: "Cartes",
    chkobbasName: "Chkobbas"
  },
  ar: {
    slogan: "شكّب وين ما تحبّ وقت ما تحبّ",
    gameSubtitle: "لعبة الشكوبة التونسية",
    usernameLabel: "إسم اللاعب",
    cardBackLabel: "ظهر الورقة",
    langLabel: "اللغة",
    sfxLabel: "تشغيل الصوت",
    playSingle: "إلعب وحدك",
    playMulti: "إلعب أونلاين",
    howToPlay: "كيفاش تلعب",

    singleTitle: "إلعب وحدك",
    singleSub: "إعدادات الطلرح",
    botDiff: "صعوبة البوت",
    targetScore: "السكور",
    playBtn: "ألعب شكوبة",
    multiTitle: "إلعب أونلاين",
    multiSub: "العب مع صاحبك",
    createParty: "أعمل روم",
    createPartySub: "أعطي الكود لصاحبك",
    joinParty: "أدخل لروم",
    joinPartySub: "حط الكود متع صاحبك",

    fullscreen: "شاشة كاملة",
    estanna: "إستنى دورك...",
    tableEmpty: "الطاولة فارغة",
    yourTurn: "دورك توا!",
    botThinking: "قاعد يخمم...",
    roundOver: "وفات الجرية",
    playAgain: "الجرية الجاية",
    mainMenu: "القايمة الرئيسية",
    matchStatus: "مازالو {points} بونطو وتولي السلطان!",
    sultan: "{name} ولى سلطان الطرح!",
    chatTitle: "شات",
    c1: "صحة!",
    c2: "شكبتك!",
    c3: "حيا عندك؟",
    c4: "شكيب لي!",
    c5: "تعلم العب!",
    c6: "كاسح!",
    c7: "لعبة ساهلة",
    c8: "جيب ديناري",
    c9: "الحية دور",
    c10: "نرسكي؟",
    c11: "إي",
    c12: "لا",
    c13: "يروح!",
    c14: "إيجا باها!",
    c15: "حطني معاه",
    c16: "نرجعو أي",
    c17: "إزربلنا",
    c18: "إن شاء الله سنا",
    bot_7ayya: "Adhika l'7ayya!",
    bot_winning_1: "Malla la3ba!",
    bot_winning_2: "Ma3adech bekri عليك أي!",
    bot_losing: "Mala zhar aandek...",
    bot_idle_1: "7ot kess atay!",
    bot_idle_2: "Dima لهنا أنتي؟",
    bot_idle_3: "توا هذا لعب؟",
    bot_idle_4: "خمم بالڨدا عاد...",
    bot_idle_5: "Vasy al3eb!",
    bot_idle_6: "أكا القهوة ويني !",
    bot_idle_7: "شرب عليك اليوم؟",
    bot_idle_8: "فماش سيقارو؟",
    bot_idle_9: "تعرف آخر واحد ربحني شصارلو؟",
    bot_idle_10: "Ya rabi ya rabi!",
    bot_idle_11: "Al3ab w oskot!",
    bot_idle_12: "Zid thabbet, sba7 l khir!",
    bot_chkobba_1: "Hahahaha Chkoba!",
    bot_chkobba_2: "CHKOBAAAAA!",
    bot_chkobba_3: "Rahma leee!",
    paused: "وقوف",
    resumeGame: "كمل الطرح",
    quitToMenu: "أخرج للقايمة",
    category: "تحسيب",
    cardsName: "كارطة",
    chkobbasName: "شكايب"
  }
};

window.translations = translations;
window.currentLang = localStorage.getItem('chkobba_lang') || 'en';

window.changeLanguage = function (lang) {
  if (!translations[lang]) lang = 'en';
  window.currentLang = lang;
  localStorage.setItem('chkobba_lang', lang);

  // Set initial radio state
  const langRadio = document.querySelector(`input[name="lang"][value="${lang}"]`);
  if (langRadio) langRadio.checked = true;

  // Toggle RTL class on body for Arabic
  if (lang === 'ar') {
    document.body.classList.add('rtl');
  } else {
    document.body.classList.remove('rtl');
  }

  // Translate all [data-i18n] elements
  const elements = document.querySelectorAll('[data-i18n]');
  elements.forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (translations[lang] && translations[lang][key]) {
      // Check if it's an input/placeholder or textContent
      if (el.tagName === 'INPUT' && (el.type === 'text' || el.type === 'password' || el.type === 'search')) {
        el.placeholder = translations[lang][key];
      } else {
        el.textContent = translations[lang][key];
      }
    }
  });
  
  // Re-run dynamic text if game is active
  if (typeof updateTranslationHooks === 'function') {
    updateTranslationHooks();
  }

  // Update rules content to match the new global language
  if (typeof renderRules === 'function') {
    renderRules(lang);
  }
};

// Initialize translation on load
document.addEventListener('DOMContentLoaded', () => {
  changeLanguage(window.currentLang);
});
