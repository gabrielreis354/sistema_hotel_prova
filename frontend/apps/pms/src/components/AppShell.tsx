import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, matchPath, useLocation } from 'react-router-dom';
import { Ellipsis } from 'lucide-react';
import { Button, cn } from '@hotel/ui';
import { useAuthStore } from '../stores/auth.js';
import { mobileNavForRole, navGroupsForRole, type NavItem } from '../routes/nav.js';
import { homeForRole } from '../routes/roleHome.js';
import { useMyTenant } from '../features/tenant/index.js';
import { GeswayLogo } from './GeswayLogo.js';

const ROLE_LABEL: Record<string, string> = {
  ADMIN: 'Administrador',
  RECEPTIONIST: 'Recepção',
  WAITER: 'Garçom',
};

/** Iniciais do avatar: as duas primeiras palavras que começam por letra ("Recepção Aurora 1" → "RA"). */
export function initials(name: string | undefined): string {
  const words = (name ?? '').split(/\s+/).filter((w) => /^\p{L}/u.test(w));
  return words.slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '?';
}

/**
 * Casca do app: navegação lateral no desktop, barra inferior no mobile (§7.1). O menu é
 * filtrado pelo papel do usuário — a mesma fonte (nav.ts) que o RequireRole usa no gate.
 * No celular, no máximo 5 abas; o que não cabe vai para "Mais" (D-3, T-05.3).
 *
 * Identidade da SPEC-10 (T-10.4, protótipo aprovado em 22/11): barra lateral esmeralda com o logo,
 * grupos Operação e Gestão e o usuário no pé; topo com a faixa verde e areia; telas sobre o fundo
 * areia. O usuário aparece uma vez só: no pé da barra no desktop, no topo no celular.
 *
 * Papel com um destino só (garçom) não tem navegação: só o topo, com o logo e quem está logado (F2, 25/11).
 */
export function AppShell() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const groups = user ? navGroupsForRole(user.role) : [];
  const mobile = user ? mobileNavForRole(user.role) : { primary: [], more: [] };
  // Nome do hotel no cabeçalho (T-08.2): a mesma consulta do emissor do comprovante (T-09.1), em
  // cache por uma hora. Sem resposta, o lugar dele fica com "Gesway".
  const { data: tenant } = useMyTenant();

  const role = user ? ROLE_LABEL[user.role] : '';
  const home = user ? homeForRole(user.role) : '/';
  // Papel com um destino só (o garçom, que só tem a Comanda): sem barra lateral e sem barra de baixo. No
  // tablet a barra comia 236 de 800 px para mostrar um item; no celular, 55 px de uma aba que leva à tela
  // em que ele já está (linha de base de 24/11; decisão do Sirlande de 25/11). Topo, hotel e "Sair" ficam.
  const hasNav = groups.reduce((n, g) => n + g.items.length, 0) > 1;

  // minmax(0,1fr): a coluna do conteúdo encolhe com a tela; com 1fr ela crescia até a tabela mais
  // larga e a página rolava de lado em 768 px (qa-explorador de 15/11, CA-08.g).
  // As laterais seguras (pl/pr) só valem no iPhone deitado, por causa do entalhe; no resto são 0.
  // --tabbar: altura da barra de baixo do celular, para o que fica preso acima dela (o main e o total da
  // comanda). Sem navegação ela não existe, e o valor é 0.
  return (
    <div
      className={cn(
        'min-h-screen bg-ground pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]',
        hasNav ? '[--tabbar:3rem] md:grid md:grid-cols-[236px_minmax(0,1fr)]' : '[--tabbar:0px]',
      )}
    >
      {/* Atalho de teclado: primeiro Tab da página, pula os itens do menu e vai ao conteúdo. Fica
          fora da tela até receber foco; fixo para não virar célula da grade (audit de 22/11). */}
      <a
        href="#conteudo"
        className="fixed left-3 top-3 z-50 -translate-y-24 rounded-md bg-white px-4 py-3 text-sm font-semibold text-brand shadow-lg transition-transform focus:translate-y-0 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        Pular para o conteúdo
      </a>
      {/* Barra lateral — o fundo vai até o fim da página; o conteúdo dela fica preso no topo ao rolar,
          com o usuário sempre no pé da tela. */}
      {hasNav && (
        <aside className="hidden bg-nav text-nav-fg md:block">
          <div className="sticky top-0 flex h-screen min-h-[560px] flex-col overflow-y-auto">
            {/* O logo leva à tela inicial do papel (o Hoje; o garçom não tem barra). A frase pode quebrar:
                com a fonte aumentada no navegador, ela não estoura a barra de 236 px (audit de 22/11). */}
            <Link
              to={home}
              aria-label="Gesway, gestão hoteleira, ir para o início"
              className="mx-2 mb-2 mt-3 flex items-center gap-3.5 rounded-[10px] px-3 pb-[14px] pt-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nav-accent"
            >
              <GeswayLogo className="h-[47px] w-14 shrink-0 text-nav-strong" />
              <div className="flex min-w-0 flex-col" aria-hidden="true">
                <span className="text-wordmark text-nav-strong">
                  GES<span className="text-nav-accent">WAY</span>
                </span>
                <span className="text-wordmark-tag text-nav-muted">GESTÃO HOTELEIRA</span>
              </div>
            </Link>
            <div className="mx-5 h-px bg-white/15" />
            <nav aria-label="Menu" className="flex flex-col gap-4 px-3 pt-[18px]">
              {groups.map((group, index) => (
                <div
                  key={group.id}
                  role="group"
                  aria-labelledby={`menu-${group.id}`}
                  className={cn('flex flex-col', index > 0 && 'border-t border-white/15 pt-4')}
                >
                  <span
                    id={`menu-${group.id}`}
                    className="px-2.5 pb-2 text-overline uppercase text-nav-muted"
                  >
                    {group.title}
                  </span>
                  <div className="flex flex-col gap-1">
                    {group.items.map((item) => (
                      <NavItemLink key={item.to} item={item} />
                    ))}
                  </div>
                </div>
              ))}
            </nav>
            {/* Usuário no pé da barra (proposta de 22/11). A engrenagem de configurações da conta fica
                de fora até a tela existir: botão que não leva a lugar nenhum é pior que nenhum. */}
            <div data-area="usuario" className="mt-auto flex items-center gap-2.5 border-t border-white/15 px-3 py-3">
              <span
                aria-hidden="true"
                className="flex size-10 shrink-0 items-center justify-center rounded-full bg-nav-fg text-sm font-bold text-brand"
              >
                {initials(user?.name)}
              </span>
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-semibold text-nav-strong" title={user?.name}>
                  {user?.name}
                </span>
                <span className="truncate text-support text-nav-muted">{role}</span>
              </div>
            </div>
          </div>
        </aside>
      )}

      <div className="flex min-h-screen min-w-0 flex-col">
        {/* Topo com a faixa verde e areia. Hotel à esquerda e "Sair" à direita, na mesma coluna de até
            1440 px do conteúdo (R-7). No celular, quem está logado fica embaixo do hotel: num aparelho
            compartilhado o garçom precisa ver de quem é a sessão antes de lançar (🟡-3 do qa-redteam de 15/11). */}
        <header className="border-b border-gray-200 bg-gradient-to-r from-strip-from to-strip-to">
          <div className="mx-auto flex min-h-14 w-full max-w-[1440px] items-center justify-between gap-3 px-4 py-2 md:px-8">
            <div className="flex min-w-0 items-center gap-2.5">
              {/* Sem a barra lateral (garçom), o logo e quem está logado ficam no topo em toda largura. */}
              <GeswayLogo className={cn('h-8 w-[38px] shrink-0 text-brand', hasNav && 'md:hidden')} />
              <div className="min-w-0">
                {/* Nome longo corta com "…"; o inteiro fica no title, como o do usuário (R-6). */}
                <div className="truncate text-sm font-semibold text-gray-900" title={tenant?.name ?? 'Gesway'}>
                  {tenant?.name ?? 'Gesway'}
                </div>
                <div data-area="usuario-celular" className={cn('truncate text-support text-gray-600', hasNav && 'md:hidden')}>
                  {user?.name} · {role}
                </div>
              </div>
            </div>
            {/* 48 px no toque (CA-08.g); compacto só com mouse a partir de 1280 px (desk, R-3). */}
            {/* O secundário do @hotel/ui virou este visual (F2, 25/11): não precisa mais sobrescrever o ghost. */}
            <Button
              variant="secondary"
              className="shrink-0 desk:h-9 desk:min-h-0 xl:px-3 xl:text-sm"
              onClick={logout}
            >
              Sair
            </Button>
          </div>
        </header>

        <main
          id="conteudo"
          tabIndex={-1}
          className="mx-auto w-full max-w-[1440px] flex-1 p-4 pb-[calc(var(--tabbar)+2rem+max(6px,env(safe-area-inset-bottom)))] focus:outline-none md:px-8 md:pb-4"
        >
          <Outlet />
        </main>

        {hasNav && <MobileTabs primary={mobile.primary} more={mobile.more} />}
      </div>
    </div>
  );
}

// Aba do celular: ícone em cima, rótulo embaixo (12 px, o piso da escala) — o rótulo nunca some.
const TAB = 'relative flex min-h-touch min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 py-1 text-center text-support';
// Aba ativa: cor da marca, fundo levíssimo e fio de 3 px em cima — o fio diz "você está aqui" sem depender da cor.
const TAB_ACTIVE = 'bg-brand/5 font-medium text-brand before:absolute before:inset-x-0 before:top-0 before:h-[3px] before:bg-brand';

/**
 * Aba "Mais". O fio diz "você está numa tela do Mais" (`inMore`). Só aberta, ela ganha o fundo e a cor, sem
 * o fio: com o fio nas duas, a aba da tela atual e o "Mais" apareciam ao mesmo tempo como "você está aqui"
 * (linha de base de 24/11). O aberto também está no aria-expanded.
 */
export function moreTabClass(open: boolean, inMore: boolean): string {
  if (inMore) return TAB_ACTIVE;
  return open ? 'bg-brand/5 text-brand' : 'text-gray-600';
}

/** Barra inferior do celular: abas diretas + "Mais" com o restante (só se houver restante). */
function MobileTabs({ primary, more }: { primary: NavItem[]; more: NavItem[] }) {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const moreRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLElement>(null);
  const inMore = more.some((i) => matchPath({ path: i.to, end: false }, pathname));

  // Navegou (por um item do "Mais" ou pela barra): a folha fecha.
  useEffect(() => setOpen(false), [pathname]);

  // A folha abriu: o foco entra nela, no primeiro item (🟢-3 do qa-redteam da T-05.3; decisão de
  // 15/11, SPEC-08 §9). Sem isso, quem usa teclado ou leitor de tela fica atrás do fundo escuro.
  useEffect(() => {
    if (open) sheetRef.current?.querySelector<HTMLElement>('a, button')?.focus();
  }, [open]);

  // Folha aberta: o fundo escuro diz "isto é modal", então a página por trás não rola (linha de base de
  // 24/11: o scrollY andava 100 px com a folha aberta e a recepcionista perdia onde estava).
  // A tela passou do md com a folha aberta (celular grande deitado, janela alargada): o md:hidden só a
  // esconde, e a trava de rolagem ficaria presa. Fecha de verdade (🟡1 do qa-redteam da F2).
  useEffect(() => {
    if (!open || !window.matchMedia) return;
    const md = window.matchMedia('(min-width: 768px)');
    if (md.matches) setOpen(false);
    const onChange = (e: MediaQueryListEvent) => e.matches && setOpen(false);
    md.addEventListener('change', onChange);
    return () => md.removeEventListener('change', onChange);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const before = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = before;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        moreRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className="md:hidden">
      {open && (
        <>
          {/* Fundo: toque fora fecha. Não é foco de teclado — o Esc faz o mesmo. */}
          <div
            className="sheet-backdrop fixed inset-0 z-30 bg-gray-900/30"
            aria-hidden="true"
            onClick={() => {
              setOpen(false);
              moreRef.current?.focus(); // como o Esc: o foco não cai no body
            }}
          />
          <nav
            ref={sheetRef}
            id="menu-mais"
            aria-label="Mais opções"
            // O foco saiu da folha (Tab depois do último item, Shift+Tab antes do primeiro): ela fecha, em
            // vez de ficar aberta com o foco na barra por trás (linha de base de 24/11). Ir ao "Mais" não
            // conta: o clique nele já fecha. Sem destino (relatedTarget nulo) também não: no Safari do
            // iPhone o toque num link não lhe dá foco, e fechar ali desmontaria o link antes de navegar.
            onBlur={(e) => {
              const next = e.relatedTarget as Node | null;
              if (!next || sheetRef.current?.contains(next) || moreRef.current?.contains(next)) return;
              setOpen(false);
            }}
            className="sheet-up fixed inset-x-0 bottom-[calc(3rem+max(6px,env(safe-area-inset-bottom)))] z-30 rounded-t-lg border-t border-gray-200 bg-white p-2 shadow-lg"
          >
            <ul>
              {more.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    className={({ isActive }) =>
                      cn(
                        'flex min-h-touch items-center rounded-md px-4 text-base',
                        isActive ? 'bg-brand/10 font-medium text-brand' : 'text-gray-800 hover:bg-gray-100',
                      )
                    }
                  >
                    <item.icon aria-hidden="true" className="mr-3 size-5 shrink-0" strokeWidth={1.75} />
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
        </>
      )}

      {/* Folga para a barra de gestos do iPhone (estudo de responsividade, R-4). */}
      <nav
        aria-label="Navegação principal"
        className="fixed inset-x-0 bottom-0 z-40 flex border-t border-gray-200 bg-white pb-[max(6px,env(safe-area-inset-bottom))]"
      >
        {primary.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) => cn(TAB, isActive ? TAB_ACTIVE : 'text-gray-600')}
          >
            <item.icon aria-hidden="true" className="size-5 shrink-0" strokeWidth={1.75} />
            <span className="max-w-full truncate">{item.label}</span>
          </NavLink>
        ))}
        {more.length > 0 && (
          <Button
            ref={moreRef}
            variant="ghost"
            aria-expanded={open}
            aria-controls="menu-mais"
            onClick={() => setOpen((v) => !v)}
            className={cn(
              TAB,
              'rounded-none font-normal [@media(hover:hover)]:hover:bg-transparent focus-visible:ring-inset focus-visible:ring-brand focus-visible:ring-offset-0',
              moreTabClass(open, inMore),
            )}
          >
            <Ellipsis aria-hidden="true" className="size-5 shrink-0" strokeWidth={2.75} />
            <span>Mais</span>
          </Button>
        )}
      </nav>
    </div>
  );
}

/**
 * Item do menu lateral (T-08.2; identidade da SPEC-10). Ativo = fundo nav-active, texto branco e fio
 * de 3 px nav-accent à esquerda — o fio diz "você está aqui" mesmo para quem não distingue a cor.
 * Movimento só no hover, curto (proposta de 22/11).
 */
function NavItemLink({ item }: { item: NavItem }) {
  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      className={({ isActive }) =>
        cn(
          // 48 px no toque: a barra lateral já aparece no tablet (md), onde tinha 36 px (CA-08.g); compacto só com mouse (desk, R-3).
          'relative flex min-h-touch items-center gap-3 rounded-[10px] px-3 py-2.5 text-sm transition-colors duration-150 desk:min-h-0',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nav-accent',
          isActive
            ? 'bg-nav-active font-semibold text-nav-strong before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:rounded-l-[10px] before:bg-nav-accent'
            : 'text-nav-fg hover:bg-black/15',
        )
      }
    >
      <item.icon aria-hidden="true" className="size-5 shrink-0" strokeWidth={1.75} />
      {item.label}
    </NavLink>
  );
}
