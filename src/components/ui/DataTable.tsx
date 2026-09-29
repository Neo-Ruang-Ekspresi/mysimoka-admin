import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { cn } from '@/lib/object';
import { EmptyState } from './States';

export type Column<T> = {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** Nilai untuk sorting; kolom tanpa sortValue tidak bisa diurutkan. */
  sortValue?: (row: T) => string | number | null | undefined;
  className?: string;
  headerClassName?: string;
};

const PAGE_SIZES = [10, 25, 50, 100];

export function DataTable<T>({
  rows,
  columns,
  getRowId,
  getSearchText,
  searchPlaceholder = 'Cari…',
  filters,
  actions,
  onRowClick,
  emptyTitle = 'Belum ada data',
  emptyDescription,
  initialSort,
  initialPageSize = 10,
}: {
  rows: T[];
  columns: Column<T>[];
  getRowId: (row: T) => string;
  getSearchText?: (row: T) => string;
  searchPlaceholder?: string;
  filters?: ReactNode;
  actions?: ReactNode;
  onRowClick?: (row: T) => void;
  emptyTitle?: string;
  emptyDescription?: ReactNode;
  initialSort?: { key: string; dir: 'asc' | 'desc' };
  initialPageSize?: number;
}) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState(initialSort ?? null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    let result = needle && getSearchText ? rows.filter(row => getSearchText(row).toLowerCase().includes(needle)) : rows;
    const column = sort ? columns.find(item => item.key === sort.key) : null;
    if (sort && column?.sortValue) {
      const get = column.sortValue;
      result = [...result].sort((a, b) => {
        const va = get(a);
        const vb = get(b);
        if (va === vb) return 0;
        if (va === null || va === undefined) return 1;
        if (vb === null || vb === undefined) return -1;
        const cmp = typeof va === 'number' && typeof vb === 'number'
          ? va - vb
          : String(va).localeCompare(String(vb), 'id-ID', { numeric: true });
        return sort.dir === 'asc' ? cmp : -cmp;
      });
    }
    return result;
  }, [rows, query, sort, columns, getSearchText]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  useEffect(() => {
    setPage(1);
  }, [query, pageSize, rows]);
  const safePage = Math.min(page, pageCount);
  const pageRows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const toggleSort = (key: string) => {
    setSort(current => (current?.key === key ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
  };

  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-3 border-b border-line px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          {getSearchText ? (
            <label className="relative block w-full sm:w-64">
              <span className="sr-only">Cari</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
              <input
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder={searchPlaceholder}
                className="h-9 w-full rounded-lg border border-line-strong bg-card pl-9 pr-3 text-sm text-fg placeholder:text-fg-subtle focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              />
            </label>
          ) : null}
          {filters}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title={rows.length === 0 ? emptyTitle : 'Tidak ada hasil'}
          description={rows.length === 0 ? emptyDescription : 'Coba ubah kata kunci atau filter.'}
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-line bg-card-muted/60 text-xs uppercase tracking-wide text-fg-subtle">
                {columns.map(column => (
                  <th key={column.key} scope="col" className={cn('px-4 py-2.5 font-medium', column.headerClassName)}>
                    {column.sortValue ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(column.key)}
                        className="inline-flex items-center gap-1 uppercase hover:text-fg"
                      >
                        {column.header}
                        {sort?.key === column.key ? (
                          sort.dir === 'asc' ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />
                        ) : null}
                      </button>
                    ) : (
                      column.header
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageRows.map(row => (
                <tr
                  key={getRowId(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={cn(
                    'border-b border-line last:border-0',
                    onRowClick && 'cursor-pointer hover:bg-brand-50/60 dark:hover:bg-brand-900/20',
                  )}
                >
                  {columns.map(column => (
                    <td key={column.key} className={cn('px-4 py-3 align-middle text-fg', column.className)}>
                      {column.cell(row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {filtered.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 text-xs text-fg-subtle">
          <div className="flex items-center gap-2">
            <span>
              {(safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, filtered.length)} dari {filtered.length}
            </span>
            <select
              value={pageSize}
              onChange={event => setPageSize(Number(event.target.value))}
              className="h-7 rounded-md border border-line-strong bg-card px-1.5 text-xs text-fg"
              aria-label="Baris per halaman"
            >
              {PAGE_SIZES.map(size => (
                <option key={size} value={size}>
                  {size} / halaman
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="rounded-md p-1.5 hover:bg-card-muted disabled:opacity-40"
              onClick={() => setPage(safePage - 1)}
              disabled={safePage <= 1}
              aria-label="Halaman sebelumnya"
            >
              <ChevronLeft className="size-4" />
            </button>
            <span className="px-2 tabular-nums">
              {safePage} / {pageCount}
            </span>
            <button
              type="button"
              className="rounded-md p-1.5 hover:bg-card-muted disabled:opacity-40"
              onClick={() => setPage(safePage + 1)}
              disabled={safePage >= pageCount}
              aria-label="Halaman berikutnya"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Select kecil untuk filter di toolbar tabel. */
export function FilterSelect({
  value,
  onChange,
  options,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  label: string;
}) {
  return (
    <select
      value={value}
      onChange={event => onChange(event.target.value)}
      aria-label={label}
      className="h-9 w-full rounded-lg border border-line-strong bg-card px-2.5 text-sm text-fg sm:w-auto"
    >
      {options.map(option => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
