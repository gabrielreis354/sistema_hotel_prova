/**
 * Marcador de tela ainda não implementada. A Fase 0 entrega a casca, o login e o roteamento
 * por papel; cada tela real chega na sua fase (§11 do plano). Todo estado vazio traz o
 * próximo passo, nunca uma tela morta (§10).
 */
export function Placeholder({ title, phase }: { title: string; phase: string }) {
  return (
    <section className="mx-auto max-w-xl rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center">
      <h1 className="text-lg font-semibold">{title}</h1>
      <p className="mt-2 text-sm text-gray-500">
        Tela prevista para <strong>{phase}</strong>. A fundação (auth, rotas por papel, cliente
        de API tipado e design system) já está no ar.
      </p>
    </section>
  );
}
