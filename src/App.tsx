import { useMemo, useState } from 'react';
import { CategoriesPage } from './pages/CategoriesPage';
import { DashboardPage } from './pages/DashboardPage';
import { MovementsPage } from './pages/MovementsPage';
import { ProductsPage } from './pages/ProductsPage';
import { ReportsPage } from './pages/ReportsPage';
import { SuppliersPage } from './pages/SuppliersPage';

type Route =
  | 'dashboard'
  | 'products'
  | 'categories'
  | 'suppliers'
  | 'movements'
  | 'reports';

const NAV: Array<{ id: Route; label: string }> = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'products', label: 'Produtos' },
  { id: 'categories', label: 'Categorias' },
  { id: 'suppliers', label: 'Fornecedores' },
  { id: 'movements', label: 'Movimentos' },
  { id: 'reports', label: 'Relatórios' },
];

export default function App() {
  const [route, setRoute] = useState<Route>('dashboard');
  const isBrowserDemo = useMemo(
    () => typeof window !== 'undefined' && !window.inventoryApi,
    [],
  );

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">ControleEstoque</div>
          <div className="brand-sub">Desktop · offline-first</div>
        </div>
        <nav className="nav" aria-label="Principal">
          {NAV.map((item) => (
            <button
              key={item.id}
              type="button"
              className={route === item.id ? 'active' : ''}
              onClick={() => setRoute(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </aside>

      <main className="main">
        {isBrowserDemo && (
          <div className="demo-banner">
            Modo demonstração no navegador (SQLite via sql.js + localStorage). No app Electron os
            dados ficam em arquivo local do usuário.
          </div>
        )}
        {route === 'dashboard' && <DashboardPage />}
        {route === 'products' && <ProductsPage />}
        {route === 'categories' && <CategoriesPage />}
        {route === 'suppliers' && <SuppliersPage />}
        {route === 'movements' && <MovementsPage />}
        {route === 'reports' && <ReportsPage />}
      </main>
    </div>
  );
}
