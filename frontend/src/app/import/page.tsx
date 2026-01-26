'use client';

import { useState, useRef, useEffect } from 'react';
import {
  Upload,
  Download,
  FileSpreadsheet,
  CheckCircle,
  AlertCircle,
  Loader2,
  FileUp,
  Info,
  ArrowRight,
  Plus,
  RefreshCw,
  X,
  ChevronDown,
  ChevronRight,
  Undo2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Navbar } from '@/components/layout/Navbar';
import { AuthProvider } from '@/components/layout/AuthProvider';
import { useStore } from '@/store/useStore';
import { excelApi, ImportPreviewResult } from '@/lib/api';
import { cn } from '@/lib/utils';

export default function ImportPage() {
  return (
    <AuthProvider>
      <ImportContent />
    </AuthProvider>
  );
}

function ImportContent() {
  const { user } = useStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // State
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [preview, setPreview] = useState<ImportPreviewResult | null>(null);
  const [importComplete, setImportComplete] = useState(false);
  const [importResult, setImportResult] = useState<{
    rows_created: number;
    rows_updated: number;
  } | null>(null);

  // Undo state
  const [lastImport, setLastImport] = useState<{
    batch_id: string;
    username: string;
    filename: string;
    rows_created: number;
    rows_updated: number;
    created_at: string;
  } | null>(null);
  const [isUndoing, setIsUndoing] = useState(false);
  const [showUndoConfirm, setShowUndoConfirm] = useState(false);

  // Expandable sections
  const [showNewOrders, setShowNewOrders] = useState(true);
  const [showUpdatedOrders, setShowUpdatedOrders] = useState(true);
  const [showUnchangedOrders, setShowUnchangedOrders] = useState(false);

  const isInternal = user?.role === 'internal' || user?.role === 'admin';

  // Fetch last import on mount
  useEffect(() => {
    if (isInternal) {
      excelApi.getLastImport().then((data) => {
        setLastImport(data.batch);
      }).catch(() => {});
    }
  }, [isInternal]);

  const handleFileSelect = (file: File) => {
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xlsm')) {
      toast.error('Invalid file type. Please select an Excel file (.xlsx or .xlsm). Older .xls files need to be saved as .xlsx first.');
      return;
    }
    setSelectedFile(file);
    setPreview(null);
    setImportComplete(false);
    setImportResult(null);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  };

  const handlePreview = async () => {
    if (!selectedFile) return;

    setIsPreviewing(true);
    try {
      const result = await excelApi.previewImport(selectedFile);
      setPreview(result);
      if (!result.success && result.error) {
        toast.error(result.error);
      }
    } catch (error: any) {
      const detail = error.response?.data?.detail;
      toast.error(detail || 'Failed to analyze the file. Please check the file format and try again.');
    } finally {
      setIsPreviewing(false);
    }
  };

  const handleImport = async () => {
    if (!selectedFile) return;

    setIsImporting(true);
    try {
      const result = await excelApi.importExcel(selectedFile);
      setImportComplete(true);
      setImportResult({
        rows_created: result.rows_created,
        rows_updated: result.rows_updated,
      });
      toast.success(`Import complete: ${result.rows_created} created, ${result.rows_updated} updated`);
      // Refresh last import info for undo button
      if (result.batch_id) {
        excelApi.getLastImport().then((data) => {
          setLastImport(data.batch);
        }).catch(() => {});
      }
    } catch (error: any) {
      const detail = error.response?.data?.detail;
      toast.error(detail || 'Import failed. Please check the file and try again.');
    } finally {
      setIsImporting(false);
    }
  };

  const handleUndo = async () => {
    setIsUndoing(true);
    try {
      const result = await excelApi.undoLastImport();
      toast.success(`Import undone: ${result.orders_deleted} orders deleted, ${result.orders_reverted} orders reverted`);
      setLastImport(null);
      setShowUndoConfirm(false);
      // If we just undid the import we completed on this page, reset the success state
      setImportComplete(false);
      setImportResult(null);
    } catch (error: any) {
      const detail = error.response?.data?.detail;
      toast.error(detail || 'Failed to undo import.');
    } finally {
      setIsUndoing(false);
    }
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const blob = await excelApi.exportExcel();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `orderbook_export_${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success('Export downloaded');
    } catch (error) {
      toast.error('Export failed. Please try again or contact support if the problem persists.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleReset = () => {
    setSelectedFile(null);
    setPreview(null);
    setImportComplete(false);
    setImportResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const formatFieldName = (field: string): string => {
    return field.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
  };

  if (!isInternal) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <main className="max-w-4xl mx-auto px-4 py-12 text-center">
          <AlertCircle className="w-16 h-16 mx-auto text-gray-300 mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h1>
          <p className="text-gray-500">Import/Export is only available for internal users.</p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Import / Export</h1>
          <p className="text-gray-500 mt-1">Import orders from Excel or export your data</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Upload & Export */}
          <div className="space-y-6">
            {/* Import Card */}
            <div className="card p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Upload className="w-5 h-5 text-primary-600" />
                Import Orders
              </h2>

              {/* Drop Zone */}
              <div
                onDrop={handleDrop}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onClick={() => !selectedFile && fileInputRef.current?.click()}
                className={cn(
                  'border-2 border-dashed rounded-xl p-6 text-center transition-all',
                  dragOver
                    ? 'border-primary-500 bg-primary-50'
                    : selectedFile
                    ? 'border-green-300 bg-green-50'
                    : 'border-gray-300 hover:border-primary-400 hover:bg-gray-50 cursor-pointer'
                )}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xlsm"
                  onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                  className="hidden"
                />

                {selectedFile ? (
                  <div className="space-y-2">
                    <FileSpreadsheet className="w-10 h-10 mx-auto text-green-600" />
                    <p className="font-medium text-gray-900 text-sm">{selectedFile.name}</p>
                    <p className="text-xs text-gray-500">{(selectedFile.size / 1024).toFixed(1)} KB</p>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleReset(); }}
                      className="text-xs text-gray-500 hover:text-gray-700 underline"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <FileUp className="w-10 h-10 mx-auto text-gray-400" />
                    <p className="text-sm text-gray-600">Drop Excel file here</p>
                    <p className="text-xs text-gray-400">or click to browse</p>
                  </div>
                )}
              </div>

              {/* Preview Button */}
              {selectedFile && !preview && !importComplete && (
                <button
                  onClick={handlePreview}
                  disabled={isPreviewing}
                  className="w-full mt-4 btn-primary flex items-center justify-center gap-2"
                >
                  {isPreviewing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    <>
                      <ArrowRight className="w-4 h-4" />
                      Preview Changes
                    </>
                  )}
                </button>
              )}

              {/* Import Complete */}
              {importComplete && importResult && (
                <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                  <div className="flex items-center gap-2 text-green-800 mb-2">
                    <CheckCircle className="w-5 h-5" />
                    <span className="font-medium">Import Complete!</span>
                  </div>
                  <div className="text-sm text-green-700 space-y-1">
                    <p>Created: {importResult.rows_created} new orders</p>
                    <p>Updated: {importResult.rows_updated} existing orders</p>
                  </div>
                  <button
                    onClick={handleReset}
                    className="mt-3 text-sm text-green-700 hover:text-green-900 underline"
                  >
                    Import another file
                  </button>
                </div>
              )}

              {/* Undo Last Import */}
              {lastImport && (
                <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                  {!showUndoConfirm ? (
                    <>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-amber-800">Last Import</p>
                          <p className="text-xs text-amber-600 mt-0.5">
                            {lastImport.filename || 'Unknown file'} by {lastImport.username}
                          </p>
                          <p className="text-xs text-amber-600">
                            {lastImport.rows_created} created, {lastImport.rows_updated} updated
                            {lastImport.created_at && (
                              <> &middot; {new Date(lastImport.created_at).toLocaleString()}</>
                            )}
                          </p>
                        </div>
                        <button
                          onClick={() => setShowUndoConfirm(true)}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-amber-800 bg-amber-100 hover:bg-amber-200 rounded-lg transition-colors"
                        >
                          <Undo2 className="w-4 h-4" />
                          Undo
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center gap-2 text-amber-800 mb-2">
                        <AlertCircle className="w-5 h-5" />
                        <span className="font-medium">Are you sure?</span>
                      </div>
                      <p className="text-sm text-amber-700 mb-3">
                        This will delete {lastImport.rows_created} newly created orders and revert {lastImport.rows_updated} updated orders to their previous values.
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setShowUndoConfirm(false)}
                          disabled={isUndoing}
                          className="px-3 py-1.5 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleUndo}
                          disabled={isUndoing}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
                        >
                          {isUndoing ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              Undoing...
                            </>
                          ) : (
                            <>
                              <Undo2 className="w-4 h-4" />
                              Confirm Undo
                            </>
                          )}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Export Card */}
            <div className="card p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Download className="w-5 h-5 text-green-600" />
                Export Orders
              </h2>
              <p className="text-sm text-gray-500 mb-4">
                Download all orders as an Excel file using your template format.
              </p>
              <button
                onClick={handleExport}
                disabled={isExporting}
                className="w-full btn-secondary flex items-center justify-center gap-2 border-green-300 text-green-700 hover:bg-green-50"
              >
                {isExporting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Preparing...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    Download Export
                  </>
                )}
              </button>
            </div>

            {/* Info Box */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex gap-3">
                <Info className="w-5 h-5 text-blue-600 flex-shrink-0" />
                <div className="text-sm text-blue-800">
                  <p className="font-medium mb-1">Import Rules</p>
                  <ul className="list-disc list-inside space-y-1 text-blue-700 text-xs">
                    <li>PO# + Style Code identifies each row</li>
                    <li>Existing rows are updated, not duplicated</li>
                    <li>All changes tracked in history</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column - Preview Results */}
          <div className="lg:col-span-2">
            {!preview && !importComplete && (
              <div className="card p-12 text-center">
                <FileSpreadsheet className="w-16 h-16 mx-auto text-gray-300 mb-4" />
                <h3 className="text-lg font-medium text-gray-700 mb-2">No Preview Yet</h3>
                <p className="text-gray-500 text-sm">
                  Upload an Excel file and click "Preview Changes" to see what will be imported.
                </p>
              </div>
            )}

            {preview && preview.success && !importComplete && (
              <div className="space-y-4">
                {/* Summary */}
                <div className="card p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-gray-900">Import Preview</h3>
                      <p className="text-sm text-gray-500">
                        {preview.summary?.total_rows || 0} rows found in file
                      </p>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <div className="flex items-center gap-1">
                        <div className="w-3 h-3 rounded-full bg-green-500" />
                        <span>{preview.summary?.new_count || 0} New</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-3 h-3 rounded-full bg-blue-500" />
                        <span>{preview.summary?.update_count || 0} Updates</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-3 h-3 rounded-full bg-gray-300" />
                        <span>{preview.summary?.unchanged_count || 0} Unchanged</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* New Orders Section */}
                {preview.new_orders.length > 0 && (
                  <div className="card overflow-hidden">
                    <button
                      onClick={() => setShowNewOrders(!showNewOrders)}
                      className="w-full px-4 py-3 bg-green-50 border-b border-green-100 flex items-center justify-between hover:bg-green-100 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <Plus className="w-4 h-4 text-green-600" />
                        <span className="font-medium text-green-800">
                          New Orders ({preview.new_orders.length})
                        </span>
                      </div>
                      {showNewOrders ? (
                        <ChevronDown className="w-4 h-4 text-green-600" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-green-600" />
                      )}
                    </button>
                    {showNewOrders && (
                      <div className="max-h-64 overflow-y-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50 sticky top-0">
                            <tr>
                              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">PO#</th>
                              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Style</th>
                              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Customer</th>
                              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Description</th>
                              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Qty</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {preview.new_orders.map((order, idx) => (
                              <tr key={idx} className="hover:bg-green-50">
                                <td className="px-3 py-2 font-medium text-gray-900">{order.po_number}</td>
                                <td className="px-3 py-2 text-gray-600">{order.style_code}</td>
                                <td className="px-3 py-2 text-gray-600">{order.customer}</td>
                                <td className="px-3 py-2 text-gray-600 truncate max-w-[200px]">{order.description}</td>
                                <td className="px-3 py-2 text-right text-gray-600">{order.total_quantity}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {/* Updated Orders Section */}
                {preview.updated_orders.length > 0 && (
                  <div className="card overflow-hidden">
                    <button
                      onClick={() => setShowUpdatedOrders(!showUpdatedOrders)}
                      className="w-full px-4 py-3 bg-blue-50 border-b border-blue-100 flex items-center justify-between hover:bg-blue-100 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <RefreshCw className="w-4 h-4 text-blue-600" />
                        <span className="font-medium text-blue-800">
                          Orders to Update ({preview.updated_orders.length})
                        </span>
                      </div>
                      {showUpdatedOrders ? (
                        <ChevronDown className="w-4 h-4 text-blue-600" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-blue-600" />
                      )}
                    </button>
                    {showUpdatedOrders && (
                      <div className="max-h-80 overflow-y-auto divide-y divide-gray-100">
                        {preview.updated_orders.map((order, idx) => (
                          <div key={idx} className="p-3 hover:bg-blue-50">
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-medium text-gray-900">
                                {order.po_number} / {order.style_code}
                              </span>
                              <span className="text-xs text-gray-500">
                                {order.changes.length} change{order.changes.length !== 1 ? 's' : ''}
                              </span>
                            </div>
                            <div className="space-y-1">
                              {order.changes.map((change, cIdx) => (
                                <div key={cIdx} className="flex items-center gap-2 text-xs">
                                  <span className="font-medium text-gray-600 min-w-[120px]">
                                    {formatFieldName(change.field)}:
                                  </span>
                                  <span className="text-red-500 line-through">{change.old_value}</span>
                                  <ArrowRight className="w-3 h-3 text-gray-400" />
                                  <span className="text-green-600 font-medium">{change.new_value}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Unchanged Orders Section */}
                {preview.unchanged_orders.length > 0 && (
                  <div className="card overflow-hidden">
                    <button
                      onClick={() => setShowUnchangedOrders(!showUnchangedOrders)}
                      className="w-full px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between hover:bg-gray-100 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-gray-400" />
                        <span className="font-medium text-gray-600">
                          Unchanged ({preview.unchanged_orders.length})
                        </span>
                      </div>
                      {showUnchangedOrders ? (
                        <ChevronDown className="w-4 h-4 text-gray-400" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-gray-400" />
                      )}
                    </button>
                    {showUnchangedOrders && (
                      <div className="max-h-40 overflow-y-auto p-3">
                        <p className="text-xs text-gray-500 mb-2">
                          These rows exist and have no changes:
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {preview.unchanged_orders.slice(0, 50).map((order, idx) => (
                            <span
                              key={idx}
                              className="px-2 py-0.5 bg-gray-100 rounded text-xs text-gray-600"
                            >
                              {order.po_number}/{order.style_code}
                            </span>
                          ))}
                          {preview.unchanged_orders.length > 50 && (
                            <span className="px-2 py-0.5 text-xs text-gray-400">
                              +{preview.unchanged_orders.length - 50} more
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Errors */}
                {preview.errors.length > 0 && (
                  <div className="card p-4 bg-red-50 border-red-200">
                    <div className="flex items-center gap-2 text-red-800 mb-2">
                      <AlertCircle className="w-4 h-4" />
                      <span className="font-medium">Errors</span>
                    </div>
                    <ul className="text-xs text-red-700 space-y-1 list-disc list-inside">
                      {preview.errors.map((err, idx) => (
                        <li key={idx}>{err}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Confirm Import Button */}
                {(preview.new_orders.length > 0 || preview.updated_orders.length > 0) && (
                  <div className="card p-4 bg-primary-50 border-primary-200">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-primary-900">Ready to import?</p>
                        <p className="text-sm text-primary-700">
                          {preview.new_orders.length} new + {preview.updated_orders.length} updates
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={handleReset}
                          className="btn-secondary"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleImport}
                          disabled={isImporting}
                          className="btn-primary flex items-center gap-2"
                        >
                          {isImporting ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              Importing...
                            </>
                          ) : (
                            <>
                              <CheckCircle className="w-4 h-4" />
                              Confirm Import
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* No changes message */}
                {preview.new_orders.length === 0 && preview.updated_orders.length === 0 && (
                  <div className="card p-6 text-center">
                    <CheckCircle className="w-12 h-12 mx-auto text-gray-300 mb-3" />
                    <h3 className="font-medium text-gray-700 mb-1">No Changes Detected</h3>
                    <p className="text-sm text-gray-500">
                      All rows in the file already match the database.
                    </p>
                  </div>
                )}
              </div>
            )}

            {preview && !preview.success && (
              <div className="card p-6 bg-red-50 border-red-200">
                <div className="flex items-center gap-2 text-red-800 mb-2">
                  <AlertCircle className="w-5 h-5" />
                  <span className="font-semibold">Preview Failed</span>
                </div>
                <p className="text-red-700">{preview.error}</p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
