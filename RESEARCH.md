# Pesquisa técnica e decisão de arquitetura

Pesquisa realizada em 23 de outubro de 2026. Esta é uma avaliação de viabilidade, não uma garantia de bloqueio.

## Como a entrega funciona

Lives web normalmente usam HLS: uma playlist mestre aponta para variantes de bitrate e cada playlist de mídia lista segmentos curtos. Em sistemas SSAI, o servidor troca/insere segmentos publicitários na sequência HLS, mantendo uma reprodução contínua. Sinais comuns incluem `#EXT-X-DATERANGE`, `SCTE35-OUT/IN` e `#EXT-X-CUE-OUT`; `#EXT-X-DISCONTINUITY` isolado não identifica publicidade. A documentação de SSAI da Wowza mostra precisamente `EXT-X-DATERANGE` com SCTE-35 rodeando segmentos de ad break. [Wowza](https://www.wowza.com/docs/insert-ad-markers-for-ssai-delivery-with-a-wowza-streaming-engine-live-stream)

Implementações de terceiros relatam a classe `twitch-stitched-ad` em playlists e detectam limites de anúncios com `EXT-X-DATERANGE`; isso é tratado aqui como sinal experimental, pois a Twitch pode mudar nomes, tokens e a exposição do manifesto. [Streamlink, parser Twitch](https://github.com/streamlink/streamlink/blob/master/src/streamlink/plugins/twitch.py)

## Limites do Manifest V3

MV3 usa service workers sob demanda, proíbe código remoto e descontinua a variante bloqueante de `webRequest`; `declarativeNetRequest` é apropriado para regras determinísticas, não para editar dinamicamente corpos de playlists HLS. [Chrome: o que mudou no MV3](https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3)

O armazenamento usa `chrome.storage.local`, acessível por worker, popup e content scripts, evitando `localStorage` da página anfitriã. [Chrome Storage API](https://developer.chrome.com/docs/extensions/reference/api/storage/)

## Referências open source e licenças

[Purple Adblock](https://github.com/arthurbolsoni/Purple-adblock) é GPL-3.0 e utiliza assinaturas/soluções server-side. Não foi copiado código, pois além da licença não compatível com uma implementação proprietária hipotética, a abordagem depende de infraestrutura que este projeto deliberadamente não usa. O repositório também remete à lista TwitchAdSolutions; essas soluções são sensíveis a alterações de player e entrega.

## Abordagens avaliadas

| Abordagem | Estado neste projeto | Motivo |
|---|---|---|
| Regras DNR para recursos publicitários de terceiros | Implementada, conservadora | Testável e não toca em mídia HLS. |
| Player HLS próprio na página | Implementado, experimental | Observa o token temporário solicitado pela própria página e carrega a playlist no HLS.js local. Restaura o player original se houver falha fatal. |
| Limpar banner/sobreposição independente | Implementada | Complementar; conta apenas remoções reais, nunca vídeo SSAI. |

## Resultados de validação

Os testes unitários usam uma playlist simulada com `twitch-stitched-ad` e uma semântica de DOM simulada. O cenário Playwright verifica que a remoção de um anúncio visual não torna controles da página inacessíveis. Em validação manual em 23 de outubro de 2026, a tentativa isolada de `playerType=embed` não evitou um anúncio de vídeo nas lives `fer` e `boltz`; ela foi removida. Ainda falta a validação manual do player HLS próprio contra uma live real.

## Próxima investigação segura

Capture (localmente, sem guardar tokens) exemplos de playlist durante uma pausa publicitária, compare apenas tags e transições com uma playlist normal e adicione fixtures anonimizadas a `tests/`. Qualquer estratégia que altere mídia deve ser opt-in, precedida de teste de recuperação e nunca contabilizada como bloqueio sem evidência.
