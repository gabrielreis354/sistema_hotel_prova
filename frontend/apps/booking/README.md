# app-booking

Site público de reservas diretas do hotel. **Não implementado nesta fase.**

É a única superfície pública e indexável, por isso será **Next.js** (SSR/SSG) — SEO e LCP
importam para conversão. Vive por subdomínio do hotel e consome os endpoints públicos
(`/public/{subdomain}/...`, PIX). Implementação prevista para **pós-TCC** (plano §1, §11).

A estrutura existe agora só para fixar a fronteira do monorepo e o nome do pacote.
