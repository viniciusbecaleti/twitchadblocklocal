# Twitch AdBlock Local

<p align="center">
  <img src="icons/icon128.png" width="112" height="112" alt="Escudo roxo com check branco">
</p>

<p align="center">
  <strong>Um player próprio para assistir à Twitch com mais controle e menos interrupções.</strong>
</p>

O **Twitch AdBlock Local** é uma extensão para Chrome e navegadores Chromium que substitui somente o vídeo da Twitch por um player HLS próprio. A página continua funcionando normalmente: chat, navegação, informações do canal e demais recursos permanecem no lugar.

Quando a Twitch entrega um anúncio, a extensão procura uma sessão alternativa que ainda contenha a transmissão ao vivo. Se encontrar uma live limpa em 360p, mantém esse vídeo reproduzindo e verifica o retorno do HD em segundo plano. Assim que o 1080p estiver realmente livre do anúncio, a qualidade é restaurada automaticamente — sem precisar apertar `F5`.

Todo o processamento acontece no navegador. A extensão conversa diretamente com a Twitch, não usa proxy de vídeo, não depende de VLC ou Streamlink e não envia tokens de reprodução para serviços externos.

> [!IMPORTANT]
> A Twitch pode entregar anúncios dentro do próprio fluxo de vídeo. Por isso, nenhuma extensão consegue garantir uma alternativa limpa em todos os canais, contas e regiões. Este projeto só troca de fonte quando consegue verificar a playlist correspondente.

## Por que usar?

### A live continua em vez de simplesmente desaparecer

Bloqueadores tradicionais podem esconder o player ou aguardar o anúncio terminar. Esta extensão tenta encontrar a transmissão alternativa usada pela própria Twitch, inclusive a sessão de 360p associada ao mini-player.

### O 360p é temporário e estável

Quando o HD está preso ao anúncio, o player pode usar uma live limpa em 360p. Essa fonte permanece tocando sem recargas repetidas enquanto a extensão procura uma qualidade melhor.

### O HD volta sozinho

A extensão não exige que o usuário atualize a página depois do anúncio. Ela acompanha a disponibilidade das qualidades e volta para 1080p apenas quando os segmentos recentes também estiverem limpos.

### A experiência da página é preservada

Somente a área de vídeo é substituída. O chat e a navegação continuam sendo os componentes originais da Twitch.

### Privacidade por padrão

Não existe servidor intermediário recebendo a live ou os tokens. As playlists vêm da própria Twitch, e os tokens temporários são mantidos apenas durante a reprodução.

## Experiência em resumo

| Situação | Comportamento da extensão |
| --- | --- |
| Live normal | Reproduz no player próprio com a melhor qualidade disponível |
| Anúncio detectado | Verifica sessões alternativas e playlists de mídia |
| Live limpa disponível em 360p | Mantém a transmissão tocando de forma estável |
| 1080p ainda contém anúncio | Continua no 360p sem recarregar o vídeo |
| 1080p volta limpo | Troca automaticamente para HD |
| Usuário muda de canal | Detecta a nova rota e atualiza a fonte do player |
| Nenhuma alternativa limpa disponível | Informa que está buscando uma transmissão válida e continua tentando |

## Principais recursos

- Player próprio integrado à página da Twitch.
- Controles inspirados no YouTube, com aparecimento instantâneo e desaparecimento gradual após três segundos.
- Reprodução, pausa, volume dinâmico, mudo, tela cheia e seleção de qualidade.
- Volume e estado de mudo preservados ao trocar de live.
- Opção de baixa latência no menu de configurações.
- Detecção de troca de canal sem exigir recarregamento da página.
- Busca por uma sessão alternativa quando a playlist atual contém anúncio.
- Uso estável da live limpa em 360p enquanto o HD ainda não está disponível.
- Retorno automático para 1080p somente depois de validar que os segmentos HD estão limpos.
- Popup para ativar ou pausar a proteção, inclusive por canal, e consultar diagnósticos recentes.

## Como funciona

```text
Twitch solicita um token temporário
               │
               ▼
A extensão observa a resposta localmente
               │
               ▼
Monta a playlist HLS e inicia o player próprio
               │
               ▼
Inspeciona playlists e segmentos recentes
        ┌──────┴──────┐
        │             │
   Live limpa      Anúncio detectado
        │             │
   Reproduz      Testa novas sessões
                      │
               ┌──────┴──────┐
               │             │
          360p limpo      HD limpo
               │             │
       Mantém a live     Troca para HD
       sem recarregar
```

### 1. Captura do token

A Twitch solicita um `PlaybackAccessToken` ao abrir uma live. Um script executado no contexto da página observa essa resposta e entrega apenas o token temporário ao player da extensão.

O token não é salvo no armazenamento da extensão e não é registrado nos diagnósticos.

### 2. Player HLS próprio

O player cria a URL da playlist oficial em `usher.ttvnw.net` e usa [HLS.js](https://github.com/video-dev/hls.js) para reproduzi-la dentro da própria página. O vídeo original da Twitch permanece silenciado atrás do player para evitar áudio duplicado.

Se ocorrer uma falha fatal que impeça a reprodução pelo HLS.js, a extensão remove o player próprio e restaura o player original.

### 3. Detecção de anúncios

A extensão verifica marcadores presentes nas playlists e nos fragmentos HLS, incluindo sinalizações de anúncios costurados à transmissão. Uma resolução baixa, sozinha, não é tratada como prova de anúncio.

Quando encontra um anúncio, a extensão solicita novos tokens usando os tipos de player `site`, `embed`, `popout` e `autoplay`. Cada playlist candidata é aberta e inspecionada antes de ser usada.

Uma playlist 360p que ainda contenha marcador de anúncio é rejeitada. Isso evita trocar o player apenas para mostrar o mesmo anúncio em qualidade menor.

### 4. Live alternativa em 360p

Durante um anúncio, a própria Twitch pode criar outra sessão para o mini-player exibido ao lado do chat. A extensão também observa tokens novos do mesmo canal e valida essa fonte. Se ela contiver a live limpa, passa a reproduzi-la no player principal.

Depois que uma sessão limpa em 360p começa a funcionar, ela é mantida estável. Renovações equivalentes de token não recarregam o vídeo nem fazem a tela de busca reaparecer.

### 5. Recuperação automática do HD

Enquanto o 360p continua tocando, a extensão consulta periodicamente o manifesto original. A simples presença de `1080p` no manifesto não é suficiente: os segmentos recentes da playlist HD também precisam estar sem marcadores de anúncio.

Somente após essa validação o mesmo elemento de vídeo troca para a fonte HD. A página inteira não é recarregada.

### 6. Navegação entre canais

A Twitch é uma aplicação de página única: ao trocar de canal, a URL pode mudar sem uma navegação completa. A extensão acompanha essa mudança, solicita o token do novo canal e substitui a fonte do player.

## Controles do player

- **Reproduzir/Pausar:** controla o vídeo atual.
- **Volume:** o controle deslizante aparece ao passar o mouse sobre o ícone. O valor é compartilhado entre as lives.
- **Qualidade:** permite usar o modo automático ou escolher uma resolução disponível.
- **Baixa latência:** altera os parâmetros de sincronização ao vivo e recria a sessão preservando a qualidade selecionada.
- **Tela cheia:** usa a API nativa de tela cheia do navegador.
- **Configurações:** fecha automaticamente ao clicar fora do menu.

O chat continua sendo o chat original da Twitch. A extensão ocupa somente a área do vídeo e não substitui o restante da página.

## Instalação

### Requisitos

- Node.js 20.19 ou mais recente.
- npm.
- Google Chrome ou outro navegador baseado em Chromium com suporte a Manifest V3.

### Compilar

```sh
npm install
npm run build
```

O build final será criado em `dist/`.

### Carregar no Chrome

1. Abra `chrome://extensions`.
2. Ative o **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação**.
4. Selecione a pasta `dist/` deste projeto.
5. Abra uma live da Twitch.

Carregue sempre a pasta `dist/`, nunca `src/` ou a raiz do projeto.

## Como atualizar

Depois de alterar o código:

```sh
npm run build
```

Em seguida:

1. Abra `chrome://extensions`.
2. Clique no botão de recarregar da extensão.
3. Recarregue também a aba da Twitch com `F5`.

O terceiro passo é necessário porque scripts já injetados continuam pertencendo à versão anterior. A versão ativa aparece no popup e no tooltip da engrenagem do player.

## Popup e configurações

O popup permite:

- ativar ou desativar a extensão globalmente;
- pausar a proteção somente no canal aberto;
- consultar a quantidade de sobreposições publicitárias realmente removidas;
- visualizar os eventos de diagnóstico mais recentes;
- conferir a versão instalada.

As preferências são salvas com `chrome.storage.local`.

## Privacidade e segurança

- Não existe servidor intermediário de vídeo.
- Os tokens temporários não são persistidos.
- URLs assinadas e tokens não são gravados nos diagnósticos.
- O leitor em segundo plano aceita somente playlists HTTPS de `ttvnw.net` terminadas em `.m3u8`.
- As leituras em segundo plano não enviam cookies.
- A extensão solicita acesso apenas aos domínios da Twitch e da CDN `ttvnw.net`.
- As regras de rede bloqueiam apenas recursos visuais de publicidade conhecidos de `amazon-adsystem.com` e `securepubads.g.doubleclick.net`; playlists e segmentos de vídeo da Twitch não são bloqueados por essas regras.

## Por que existe um leitor em segundo plano?

As permissões de host de uma extensão não removem as regras de CORS aplicadas a scripts executados dentro da página. A extensão tenta primeiro ler a playlist normalmente. Se a página for bloqueada pelo CORS, o service worker faz a mesma leitura usando a permissão de host.

O leitor valida domínio, protocolo, extensão do arquivo e tamanho da resposta antes de devolver o manifesto ao player.

## Diagnósticos

O popup registra estados seguros, sem incluir tokens ou URLs assinadas. Alguns exemplos:

- `ad-detected`: a playlist atual contém marcador de anúncio;
- `session-ready`: uma sessão candidata limpa foi validada;
- `candidate-rejected · ad-present`: a candidata ainda contém anúncio;
- `candidate-failed · master-http-403`: o manifesto foi recusado pelo servidor;
- `native-live-session`: uma sessão limpa criada pelo player nativo foi adotada;
- `master-quality-restored`: a qualidade HD foi validada e restaurada;
- `live-resumed`: a reprodução da live voltou ao ponto ao vivo.

## Solução de problemas

### `Cannot use import statement outside a module`

O navegador provavelmente recebeu um arquivo de desenvolvimento ou uma compilação antiga. Execute `npm run build`, carregue a pasta `dist/` e recarregue a aba da Twitch.

### `Extension context invalidated`

Isso acontece quando a extensão é recarregada enquanto uma aba ainda executa os scripts antigos. Dê `F5` na aba da Twitch.

### `Buscando transmissão sem anúncios…`

A extensão detectou anúncio, mas ainda não validou uma fonte alternativa limpa. Ela não aceita um 360p que contenha o próprio anúncio. Se a Twitch disponibilizar a sessão limpa usada pelo mini-player, a extensão a adota automaticamente.

### O player continua em 360p

O 360p permanece ativo até que uma playlist de qualidade superior esteja disponível e seus segmentos recentes estejam limpos. Mantenha a qualidade em **Automática** para permitir o retorno ao melhor nível.

### O ícone ou o código não mudou depois da atualização

Recarregue a extensão em `chrome://extensions` e depois recarregue a página da Twitch.

## Testes

### Testes unitários

```sh
npm test
```

Validam o parser de playlists, marcadores de anúncio, recuperação de qualidade, troca de canal, armazenamento, limpeza de sobreposições e segurança do leitor de playlists.

### Testes de navegador

```sh
npm run test:e2e
```

Os testes Playwright usam transmissões HLS sintéticas locais para verificar:

- reprodução real de áudio e vídeo pelo player compilado;
- rejeição de um 360p que ainda contenha anúncio;
- adoção de uma live alternativa limpa;
- manutenção do 360p durante a recuperação;
- restauração automática do HD;
- leitura de playlist pelo service worker quando o CORS bloqueia a página.

Esses testes não chamam a Twitch nem garantem que uma sessão alternativa estará sempre disponível nos servidores reais. O teste HTTPS do service worker utiliza `openssl` para criar um certificado local descartável.

## Estrutura do projeto

```text
src/
├── background/  Service worker e leitor seguro de playlists
├── blocking/    Regras de rede e estratégias de detecção/recuperação
├── content/     Integração com a página, navegação e captura de tokens
├── player/      Player HLS, controles, detecção de anúncios e qualidade
├── popup/       Interface da extensão
├── storage/     Preferências locais
└── utils/       Diagnósticos

tests/
├── e2e/         Cenários executados em Chromium com Playwright
└── fixtures/    Vídeos e playlists HLS sintéticos

icons/           Ícones da extensão em diferentes resoluções
dist/            Build carregado pelo navegador
```

Consulte também [RESEARCH.md](RESEARCH.md) para o histórico técnico, evidências e decisões do projeto.

## Limitações

- A Twitch pode alterar os formatos de token, playlist ou player sem aviso.
- Anúncios SSAI fazem parte do próprio fluxo de vídeo; não existe garantia de que uma sessão limpa alternativa estará disponível.
- A extensão não mantém um arquivo completo da live e, portanto, não permite voltar indefinidamente ao início da transmissão.
- O modo de baixa latência reduz o buffer e pode ser mais sensível a oscilações de rede.
- Testes locais cobrem o comportamento do código, mas não reproduzem todas as variações de conta, região e campanha publicitária da Twitch.

Este projeto adota uma abordagem conservadora: só troca para uma fonte quando consegue verificar a playlist de mídia correspondente.
