const { app, BrowserWindow } = require('electron')

function createWindow () {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    backgroundColor: '#000000', // Garante que o fundo comece preto
    autoHideMenuBar: true       // Esconde a barra de menu para ficar mais limpo
  })

  // AQUI É ONDE VOCÊ DIZ PARA ABRIR O NOVO FILE
  win.loadFile('fantasma.html')
}

app.whenReady().then(createWindow)
