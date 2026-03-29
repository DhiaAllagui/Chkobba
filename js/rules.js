const RULES_CONTENT = {
  en: {
    title: "📜 How to Play Chkobba (Tunisian Style)",
    intro: "Chkobba is a classic Tunisian trick-taking card game played with a 40-card Italian (Piacentine) deck. The goal is to reach 21 points first.",
    sections: [
      {
        header: "1. The Setup",
        content: "• **The Deck:** 40 cards. Suits are: Denari (Diamonds/Gold), Coppe (Cups), Spade (Swords), and Bastoni (Clubs).\n• **Values:** 1 (Ace) to 7, then 8 (Jack/Fante), 9 (Horse/Queen), and 10 (King/Re).\n• **The Deal:** Each player receives 3 cards, and 4 cards are placed face-up on the table."
      },
      {
        header: "2. How to Capture",
        content: "On your turn, you play one card from your hand to take cards from the table:\n• **Direct Match:** If you play a 7, you take a 7 from the table.\n• **The Sum:** If you play a 7, and there is a 4 and a 3 on the table (4 + 3 = 7), you take both.\n• **The Priority Rule:** If a direct match is available, you must take it. You cannot take a sum if a single card of the same value is on the table.\n• **No Match:** If you cannot take any cards, you must leave your card face-up on the table."
      },
      {
        header: "3. The 'Chkobba' (The Big Move)",
        content: "If you capture all the cards currently on the table, leaving it empty, you score a Chkobba!\n• Each Chkobba is worth 1 point.\n• **Exception:** You cannot score a Chkobba on the very last hand of the deck."
      },
      {
        header: "4. End of Round Scoring (The 4 Main Points)",
        content: "After all cards are played, players count their 'pile' to see who wins these 4 points:\n• **Carta (Cards):** The player with more than 20 cards (21 or more) gets 1 point.\n• **Dineri (Diamonds):** The player with more than 5 Diamonds (6 or more) gets 1 point.\n• **Barmila (The 7s/6s):**\n  - The player with the most 7s wins 1 point.\n  - If tied (2-2), the player with the most 6s wins.\n  - If still tied (2-2), it is a Baji (no point awarded).\n• **Sab3a l-7ayya (7 of Diamonds):** The player who captured the 7 of Diamonds gets 1 point."
      },
      {
        header: "💡 Pro Tips for New Players",
        content: "• **Protect the 7 of Diamonds:** It is the most important card in the game. Don't throw it unless you have to!\n• **Watch the Table:** Try to keep the sum of the table cards above 10 so your opponent can't make a Chkobba easily.\n• **The Last Hand:** The person who makes the last capture of the game takes all remaining cards left on the table (but this doesn't count as a Chkobba)."
      }
    ]
  },
  tn: {
    title: "🇹🇳 Qawanin El-Chkobba (قوانين الشكبة)",
    intro: "El-Hadaf (Goal): El-rabe7 houwa elli yousel el 21 points el louel.",
    sections: [
      {
        header: "1. El-Tawzi3 (The Deal)",
        content: "• **El-Kartas:** Nel3bou b 40 karta (Piacentine). Na7iw el 8, 9, wel 10 el standard.\n• **El-Fer9a:** Kol we7ed ya5ou 3 kartat, we n7ottou 4 kartat fou9 el tawla."
      },
      {
        header: "2. Kifech Terba7 el Karta (The Capture)",
        content: "• **9ad 9ad:** Ki tseb karta, lazem te5ou ka3ba kifha mel tawla (Matlan: tseb 7 te5ou 7).\n• **El-7isba (The Sum):** Ken mafamech wa7da kifha, tnajem tejma3 (Matlan: tseb 7, te5ou 4 we 3).\n• **El-9a3da:** Ken famma karta 9ad elli f'idek, lazem te5ouha hiya, mayjich te5ou el majmou3 (The Sum).\n• **Me thamma chay:** Ken ma tnajem te5ou chay, t7at karttek fou9 el tawla we tistanna."
      },
      {
        header: "3. El-Chkobba (The Big Win)",
        content: "Ki tlem el karta elli fou9 el tawla lkol, tetsamma 'Chkobba'!\n• El-Chkobba te7seb 1 point.\n• **Rad belek:** El-طرح el le5er (last hand) mafihouch Chkobba!"
      },
      {
        header: "4. La7seb fel Le5er (The 4 Points)",
        content: "Fel le5er mta3 el 'tara7', na7sbou el points:\n• **El-Karta:** Elli lamm akther mel chtal (21 karta wala akther) ya5ou 1 point.\n• **El-Dinari:** Elli 3andou akther men 5 dinari (6 wala akther) ya5ou 1 point.\n• **El-Barmila (7 wel 6):**\n  - Elli 3andou akther Saba3at (7s) ya5ou point.\n  - Ken t3adeltou (2-2), na7sbou el Settat (6s).\n  - Ken t3adeltou fel 7 wel 6, tetsamma 'Baji' (7atta 7ad maye5ou point).\n• **Sab3a l-7ayya:** Elli 3andou el 7 Dinari ya5ou 1 point."
      },
      {
        header: "💡 Nsi7a lel 7errifa (Pro Tips)",
        content: "• **3ess 3la Sab3a l-7ayya:** Hiya l-karta el kol fil kol. Matseb'bech ken matetfaza3!\n• **El-Lamma el le5ra:** Fi a5er طرح, elli lamm e5er marra ya5ou elli fadel fou9 el tawla (ama mouch chkobba)."
      }
    ]
  }
};
