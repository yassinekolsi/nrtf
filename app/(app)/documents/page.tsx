"use client";

import { useState } from "react";
import { Upload, FileText, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { documents, Document } from "@/lib/mockData";
import { useLanguage } from "@/lib/language-context";
import { cn } from "@/lib/utils";

export default function DocumentsPage() {
  const { t } = useLanguage();
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    // In v0, just show visual feedback - no actual upload
  };

  return (
    <div className="space-y-6">
      {/* Page Title */}
      <h1 className="text-2xl font-bold text-foreground">{t.documents}</h1>

      {/* Upload Zone */}
      <Card className="border-border bg-card">
        <CardContent className="p-0">
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={cn(
              "flex min-h-[180px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors",
              isDragOver
                ? "border-energy-green bg-energy-green/5"
                : "border-border hover:border-muted-foreground"
            )}
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
              <Upload className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="mt-4 text-lg font-semibold text-foreground">
              {t.uploadZone}
            </h3>
            <p className="mt-1 text-center text-sm text-muted-foreground">
              {t.uploadZoneDesc}
            </p>
            <Button variant="outline" className="mt-4">
              Browse Files
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Documents Table */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg font-semibold">
            Processed Documents
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[15px]">{t.date}</TableHead>
                <TableHead className="text-[15px]">{t.type}</TableHead>
                <TableHead className="text-[15px]">{t.period}</TableHead>
                <TableHead className="text-[15px]">{t.mainValue}</TableHead>
                <TableHead className="text-[15px]">{t.status}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {documents.map((doc) => (
                <TableRow
                  key={doc.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => setSelectedDoc(doc)}
                >
                  <TableCell className="text-[15px]">
                    {new Date(doc.upload_date).toLocaleDateString("fr-FR")}
                  </TableCell>
                  <TableCell className="text-[15px]">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      {doc.doc_type}
                    </div>
                  </TableCell>
                  <TableCell className="text-[15px]">{doc.period}</TableCell>
                  <TableCell className="text-[15px]">
                    {doc.main_value || "—"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={doc.status === "Traité" ? "default" : "secondary"}
                      className={cn(
                        doc.status === "Traité"
                          ? "bg-energy-green text-energy-green-foreground"
                          : "bg-warning-amber text-warning-amber-foreground"
                      )}
                    >
                      {doc.status === "Traité" ? t.processed : t.inProgress}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Document Detail Sheet */}
      <Sheet open={!!selectedDoc} onOpenChange={() => setSelectedDoc(null)}>
        <SheetContent className="w-[400px] sm:w-[540px]">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              {selectedDoc?.doc_type}
            </SheetTitle>
          </SheetHeader>
          {selectedDoc && (
            <div className="mt-6 space-y-6">
              <div className="space-y-4">
                <div className="flex justify-between border-b border-border pb-2">
                  <span className="text-sm text-muted-foreground">{t.period}</span>
                  <span className="text-sm font-medium">{selectedDoc.period}</span>
                </div>
                <div className="flex justify-between border-b border-border pb-2">
                  <span className="text-sm text-muted-foreground">{t.date}</span>
                  <span className="text-sm font-medium">
                    {new Date(selectedDoc.upload_date).toLocaleDateString("fr-FR")}
                  </span>
                </div>
                <div className="flex justify-between border-b border-border pb-2">
                  <span className="text-sm text-muted-foreground">{t.status}</span>
                  <Badge
                    variant={selectedDoc.status === "Traité" ? "default" : "secondary"}
                    className={cn(
                      selectedDoc.status === "Traité"
                        ? "bg-energy-green text-energy-green-foreground"
                        : "bg-warning-amber text-warning-amber-foreground"
                    )}
                  >
                    {selectedDoc.status === "Traité" ? t.processed : t.inProgress}
                  </Badge>
                </div>
              </div>

              {/* Extracted Fields */}
              <div>
                <h4 className="mb-3 text-sm font-semibold text-foreground">
                  Extracted Fields
                </h4>
                <div className="space-y-2 rounded-lg bg-muted/30 p-4">
                  {Object.entries(selectedDoc.extracted_json).map(([key, value]) => (
                    <div key={key} className="flex justify-between">
                      <span className="text-sm text-muted-foreground capitalize">
                        {key.replace(/([A-Z])/g, " $1").trim()}
                      </span>
                      <span className="text-sm font-medium">{String(value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
