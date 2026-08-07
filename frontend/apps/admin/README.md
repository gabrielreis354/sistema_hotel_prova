# app-admin

Backoffice da plataforma (gestão de tenants pela nossa equipe). **Não implementado nesta fase.**

É código nosso, de gestão do SaaS — não deve compartilhar bundle nem ser baixado pelo
navegador de um cliente, por isso é um app separado (SPA React + Vite). Depende de um
**super-admin no backend** (hoje todo `User` tem `tenant_id` NOT NULL), que é pré-requisito
pós-TCC (plano §9, §11).

A estrutura existe agora só para fixar a fronteira do monorepo e o nome do pacote.
