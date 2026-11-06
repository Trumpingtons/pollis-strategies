# Pollis Answering Strategies

Answering strategies for Ask Pollis, the assistant of [Pollis](https://github.com/saragga/pollis), the desktop environment for statistical modelling, simulation and optimisation built on Code - OSS and Julia.

An answering strategy is the way Ask Pollis turns a question into an answer: how it finds the passages, whether a reranker chooses among them, and what the answering model is told of the panel a question is asked in. A strategy is one TOML file of settings for steps that Pollis carries out, never code. Pollis lists the strategies of this repository under **From GitHub** on its **Compose > Knowledge for Models > Answering Strategies** page, and installs them from there.

Pollis has two strategies of its own, Base and Panel Aware. The strategies of this repository are those written by others, in `strategies/`.

## Writing a strategy

```toml
[strategy]
id = "panelHeavy"
label = "Panel Heavy"
description = "Asked in a panel, most passages come from the panel."
author = "Your Name"

[[steps]]
step = "search"
panelShare = 0.75

[[steps]]
step = "rerank"
by = "reranker"
query = "panel"

[[steps]]
step = "answer"
panel = "card"
```

- `[strategy]`: `id` (letters, digits, `-` and `_`, starting with a letter; not `base` or `panelAware`, the strategies of Pollis), `label`, `description`, and `author`, optional.
- `search`, first and required: `panelShare`, the share of the passages from the panel's own, from 0 to 1; or `panelNear` and `panelFar`, the shares when the panel's passages are near the question and when they are not.
- `rerank`, second and optional: `by = "reranker"`, the reranker of Set Active Models, and `query`, `"question"` (the default) or `"panel"`.
- `answer`, last and required: `panel`, `"named"` (the panel's name and menu), `"card"` (and what the panel holds) or `"none"`.
- Comments go on lines of their own.

The **Answering Strategies** page of Pollis writes a copy of any strategy with **Copy as New...**, and checks a file each time it is saved. The Writing a Strategy wiki of that page explains each setting.

## Proposing a strategy

Open a pull request that adds `strategies/<id>.toml`, one strategy per pull request. The check workflow reads it with Pollis' own TOML reader and applies the rules of Pollis. Give the scores of the strategy and of Base on the Panel FAQ test set of **Evaluate Answering Models**, run with the same models, so that others can see what the strategy changes.

## Layout

- `main` holds the sources: `strategies/<id>.toml`, and `scripts/strategies.ts`, which checks them and writes the catalogue.
- `dist` holds what Pollis reads: `strategies.json`, the index, and a copy of each strategy's file. It is generated, one commit with no history, on every push to main.

`node scripts/strategies.ts check` checks the strategies; `node scripts/strategies.ts publish out` also writes the files of `dist` to `out/`. Both need Node 22.18 or later.

## License

AGPL-3.0-or-later, see [LICENSE.txt](LICENSE.txt).
