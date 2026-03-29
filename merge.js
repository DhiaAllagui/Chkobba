const fs = require('fs');

try {
  let menu = fs.readFileSync('pages/menu.html', 'utf8');
  let lobby = fs.readFileSync('pages/lobby.html', 'utf8');
  let game = fs.readFileSync('pages/chkobba.html', 'utf8');

  const getBodyContent = (html) => {
    const match = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    return match ? match[1] : '';
  };

  let menuContent = getBodyContent(menu);
  let lobbyContent = getBodyContent(lobby);
  let gameContent = getBodyContent(game);

  // Clean duplicates
  menuContent = menuContent.replace(/<div class="radio-widget"[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/g, '');
  menuContent = menuContent.replace(/<div class="modal-overlay" id="rulesModal"[\s\S]*?<\/div>\s*<\/div>/g, '');
  menuContent = menuContent.replace(/<script src="\.\.\/js\/rules\.js"><\/script>/g, '');
  menuContent = menuContent.replace(/<script src="\.\.\/js\/radio\.js"><\/script>/g, '');

  lobbyContent = lobbyContent.replace(/<div class="radio-widget"[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/g, '');
  lobbyContent = lobbyContent.replace(/<script src="\/js\/radio\.js"><\/script>/g, '');
  
  // Extract CSS
  const getStyles = (html) => [...html.matchAll(/<style>([\s\S]*?)<\/style>/gi)].map(m => m[1]).join('\n');
  const styles = getStyles(menu) + '\n' + getStyles(lobby) + '\n' + getStyles(game);
  
  // Add SPA wrapper
  let newGame = game.replace(/<head>([\s\S]*?)<\/head>/i, '<head>$1\n<style>\n' + styles + '\n.spa-view { display: none; width:100%; height:100%; flex-direction: column; }\n.spa-view.active { display: flex; }\n</style>\n</head>');
  
  // Strip game body out and replace with wrapper
  newGame = newGame.replace(/<body[^>]*>[\s\S]*?<\/body>/gi, 
    '<body class="spa-page">\n' +
    '  <div id="view-menu" class="spa-view active">\n' + menuContent + '\n  </div>\n' +
    '  <div id="view-lobby" class="spa-view">\n' + lobbyContent + '\n  </div>\n' +
    '  <div id="view-game" class="spa-view">\n' + gameContent + '\n  </div>\n' +
    '</body>'
  );

  fs.writeFileSync('pages/spa_chkobba.html', newGame);
  console.log("Merge script completed successfully. Created pages/spa_chkobba.html");
} catch(e) {
  console.error("Error during merge:", e);
}
