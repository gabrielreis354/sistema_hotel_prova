import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './routes/ProtectedRoute.js';
import { RequireRole } from './routes/RequireRole.js';
import { AppShell } from './components/AppShell.js';
import { LoginPage } from './features/auth/LoginPage.js';
import { Placeholder } from './components/Placeholder.js';
import { GuestsListPage } from './features/guests/GuestsListPage.js';
import { GuestNewPage, GuestEditPage } from './features/guests/GuestFormPages.js';
import { GuestDetailPage } from './features/guests/GuestDetailPage.js';
import {
  NewReservationPage,
  ReservationDetailPage,
  ReservationReceiptPage,
  ReservationsListPage,
} from './features/reservations/index.js';

/**
 * Árvore de rotas. Duas camadas de proteção: ProtectedRoute exige sessão; RequireRole exige
 * papel. As telas ainda são placeholders — a Fase 0 entrega a estrutura navegável, cada tela
 * real chega na sua fase.
 */
export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route element={<ProtectedRoute />}>
          <Route element={<AppShell />}>
            {/* Recepção e admin */}
            <Route element={<RequireRole allow={['ADMIN', 'RECEPTIONIST']} />}>
              <Route index element={<Placeholder title="Hoje" phase="Fase 1 — Recepção" />} />
              <Route path="reservas" element={<ReservationsListPage />} />
              <Route path="hospedes" element={<GuestsListPage />} />
              <Route path="hospedes/novo" element={<GuestNewPage />} />
              <Route path="hospedes/:id" element={<GuestDetailPage />} />
              <Route path="hospedes/:id/editar" element={<GuestEditPage />} />
              <Route path="reservas/nova" element={<NewReservationPage />} />
              <Route path="reservas/:id" element={<ReservationDetailPage />} />
            </Route>

            {/* Comanda: recepção, admin e garçom */}
            <Route element={<RequireRole allow={['ADMIN', 'RECEPTIONIST', 'WAITER']} />}>
              <Route path="comanda" element={<Placeholder title="Comanda" phase="Fase 2 — Consumo" />} />
            </Route>

            {/* Configurações: só admin */}
            <Route element={<RequireRole allow={['ADMIN']} />}>
              <Route
                path="config/usuarios"
                element={<Placeholder title="Usuários" phase="Fase 1 — Configurações" />}
              />
            </Route>
          </Route>

          {/* Comprovante imprimível: fora do AppShell para a impressão sair só com a conta. */}
          <Route element={<RequireRole allow={['ADMIN', 'RECEPTIONIST']} />}>
            <Route path="reservas/:id/comprovante" element={<ReservationReceiptPage />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
