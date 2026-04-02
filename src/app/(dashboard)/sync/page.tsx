"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, Download, Upload } from "lucide-react";

export default function SyncPage() {
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importResult, setImportResult] = useState<{ total: number; created: number; updated: number; skipped: number } | null>(null);
  const [exportResult, setExportResult] = useState<{ exported: number } | null>(null);

  const handleImport = async () => {
    setImporting(true);
    try {
      const res = await fetch("/api/sync/import", { method: "POST" });
      const data = await res.json();
      if (data.error) {
        toast.error(data.error);
      } else {
        setImportResult(data);
        toast.success(`Imported: ${data.created} new, ${data.updated} updated`);
      }
    } catch {
      toast.error("Import failed");
    } finally {
      setImporting(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await fetch("/api/sync/export", { method: "POST" });
      const data = await res.json();
      if (data.error) {
        toast.error(data.error);
      } else {
        setExportResult(data);
        toast.success(`Exported ${data.exported} contacts to Google Sheets`);
      }
    } catch {
      toast.error("Export failed");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Google Sheets Sync</h1>
        <p className="text-muted-foreground">Two-way sync with your tracker spreadsheet</p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Download className="h-5 w-5" />
              Import from Sheet
            </CardTitle>
            <CardDescription>Read contacts from Google Sheet and upsert into database</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button onClick={handleImport} disabled={importing}>
              {importing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
              Import
            </Button>
            {importResult && (
              <div className="p-3 rounded-md bg-muted text-sm space-y-1">
                <p>Total rows: {importResult.total}</p>
                <p className="text-green-600">Created: {importResult.created}</p>
                <p className="text-blue-600">Updated: {importResult.updated}</p>
                <p className="text-muted-foreground">Skipped: {importResult.skipped}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Export to Sheet
            </CardTitle>
            <CardDescription>Write all contacts from database to Google Sheet</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button onClick={handleExport} disabled={exporting}>
              {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              Export
            </Button>
            {exportResult && (
              <div className="p-3 rounded-md bg-muted text-sm">
                Exported {exportResult.exported} contacts
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
