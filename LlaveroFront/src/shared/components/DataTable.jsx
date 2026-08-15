import { useState, useMemo } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  flexRender,
} from '@tanstack/react-table';
import { ArrowUpDown, ArrowUp, ArrowDown, FileSpreadsheet, Search } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import Button from '@/shared/components/ui/Button';

function normalizeSearchValue(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * DataTable v2 — built on @tanstack/react-table
 * Drop-in replacement with sorting, diacritical-aware search, pagination, Excel export.
 *
 * columns format (legacy-compatible):
 *   [{ key, label, render?, className?, sortable? }]
 */
export default function DataTable({
  columns,
  data = [],
  pageSize = 20,
  searchable = true,
  exportable = false,
  extraSearchKeys = [],
  exportFileName = 'datos',
  loading = false,
  onRowClick,
  onRowDoubleClick,
}) {
  const [globalFilter, setGlobalFilter] = useState('');
  const [sorting, setSorting] = useState([]);

  // Map legacy column format → tanstack column defs
  const columnDefs = useMemo(
    () =>
      columns.map((col) => ({
        id: col.key,
        accessorKey: col.key,
        header: col.label,
        cell: col.render
          ? ({ getValue, row }) => col.render(getValue(), row.original)
          : ({ getValue }) => getValue() ?? '—',
        enableSorting: col.sortable !== false && !col.key.startsWith('_'),
        meta: { className: col.className, sticky: col.sticky },
      })),
    [columns]
  );

  // Custom global filter supporting diacritical-aware search
  const globalFilterFn = useMemo(() => {
    return (row, _columnId, filterValue) => {
      if (!filterValue) return true;
      const rawSearch = filterValue.toLowerCase();
      const normalizedSearch = normalizeSearchValue(filterValue);

      const colMatch = columns.some((col) => {
        const val = row.getValue(col.key);
        return (
          String(val ?? '').toLowerCase().includes(rawSearch) ||
          normalizeSearchValue(val).includes(normalizedSearch)
        );
      });
      if (colMatch) return true;
      return extraSearchKeys.some((key) => {
        const val = row.original[key];
        return (
          String(val ?? '').toLowerCase().includes(rawSearch) ||
          normalizeSearchValue(val).includes(normalizedSearch)
        );
      });
    };
  }, [columns, extraSearchKeys]);

  const table = useReactTable({
    data,
    columns: columnDefs,
    state: { globalFilter, sorting },
    onGlobalFilterChange: setGlobalFilter,
    onSortingChange: setSorting,
    globalFilterFn,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize } },
  });

  const filteredCount = table.getFilteredRowModel().rows.length;
  const pageCount = table.getPageCount();
  const currentPage = table.getState().pagination.pageIndex;

  async function handleExport() {
    const XLSX = await import('xlsx');
    const exportData = table.getFilteredRowModel().rows.map((row) => {
      const obj = {};
      columns.forEach((col) => {
        if (!col.key.startsWith('_')) obj[col.label] = row.original[col.key] ?? '';
      });
      return obj;
    });
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Datos');
    XLSX.writeFile(wb, `${exportFileName}.xlsx`);
  }

  return (
    <div className="bg-card rounded-lg border border-border shadow-sm overflow-hidden">
      {/* Toolbar */}
      {(searchable || exportable) && (
        <div className="flex items-center justify-between px-4 py-3 border-b border-border gap-3">
          {searchable && (
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Buscar..."
                value={globalFilter}
                onChange={(e) => setGlobalFilter(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
              />
            </div>
          )}
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-xs text-muted-foreground">{filteredCount} registros</span>
            {exportable && (
              <Button variant="success" size="sm" onClick={handleExport}>
                <FileSpreadsheet className="h-3.5 w-3.5" />
                Exportar
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-max text-sm">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  const sorted = header.column.getIsSorted();
                  return (
                    <th
                      key={header.id}
                      className={cn(
                        'bg-primary text-primary-foreground text-[13px] font-semibold px-3 py-2 text-center align-middle whitespace-nowrap',
                        canSort && 'cursor-pointer select-none hover:bg-primary/90',
                        header.column.columnDef.meta?.className,
                        header.column.columnDef.meta?.sticky === 'right' && 'sticky right-0 z-10',
                      )}
                      onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                    >
                      <div className="flex items-center justify-center gap-1">
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {canSort && (
                          <span className="ml-1">
                            {sorted === 'asc' ? (
                              <ArrowUp className="h-3.5 w-3.5" />
                            ) : sorted === 'desc' ? (
                              <ArrowDown className="h-3.5 w-3.5" />
                            ) : (
                              <ArrowUpDown className="h-3 w-3 opacity-40" />
                            )}
                          </span>
                        )}
                      </div>
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {loading ? (
              // Skeleton rows
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={`skeleton-${i}`}>
                  {columns.map((col) => (
                    <td key={col.key} className={cn('px-3 py-2.5 border-b border-border', col.className)}>
                      <div className="h-4 bg-muted animate-pulse rounded w-3/4 mx-auto" />
                    </td>
                  ))}
                </tr>
              ))
            ) : table.getRowModel().rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="text-center py-12 text-muted-foreground">
                  <div className="flex flex-col items-center gap-2">
                    <Search className="h-8 w-8 opacity-30" />
                    <p>Sin resultados</p>
                  </div>
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  className={cn(
                    'hover:bg-primary/5 dark:hover:bg-primary/10 transition-colors',
                    (onRowClick || onRowDoubleClick) && 'cursor-pointer'
                  )}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  onDoubleClick={onRowDoubleClick ? () => onRowDoubleClick(row.original) : undefined}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      className={cn(
                        'px-3 py-2 text-[13px] border-b border-border text-center align-middle',
                        cell.column.columnDef.meta?.className || 'whitespace-nowrap',
                        cell.column.columnDef.meta?.sticky === 'right' && 'sticky right-0 z-10 bg-card',
                      )}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pageCount > 1 && (
        <div className="flex items-center justify-center gap-2 px-4 py-3 border-t border-border text-sm">
          <button
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            className="px-3 py-1.5 rounded-md border border-input bg-background text-sm disabled:opacity-40 hover:bg-muted transition-colors"
          >
            ‹ Anterior
          </button>
          <span className="text-muted-foreground">
            Página {currentPage + 1} de {pageCount}
          </span>
          <button
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            className="px-3 py-1.5 rounded-md border border-input bg-background text-sm disabled:opacity-40 hover:bg-muted transition-colors"
          >
            Siguiente ›
          </button>
        </div>
      )}
    </div>
  );
}
