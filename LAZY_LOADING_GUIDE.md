# Lazy Loading Guide for Heavy Libraries

## Problem
Your app loads 2+ MB of PDF/Excel libraries on initial load, even though users may never use export features.

## Solution: Dynamic Imports

### 1. Excel Export (exceljs - 931 KB)

**Current:** `client/src/lib/excelReport.ts`
```typescript
import ExcelJS from 'exceljs';

export async function exportToExcel(data: any[], filename: string) {
  const workbook = new ExcelJS.Workbook();
  // ... rest of code
}
```

**Optimized:** Use dynamic import
```typescript
export async function exportToExcel(data: any[], filename: string) {
  // Only load exceljs when this function is called
  const ExcelJS = await import('exceljs');
  
  const workbook = new ExcelJS.default.Workbook();
  // ... rest of code
}
```

---

### 2. PDF Export (jspdf - 348 KB, @react-pdf - 844 KB)

**Current:** `client/src/lib/fileExport.ts`
```typescript
import jsPDF from 'jspdf';
import { pdf } from '@react-pdf/renderer';

export async function exportToPDF(document: any) {
  const blob = await pdf(document).toBlob();
  // ... rest of code
}
```

**Optimized:**
```typescript
export async function exportToPDF(document: any) {
  // Dynamically import only when needed
  const [{ pdf }, jsPDF] = await Promise.all([
    import('@react-pdf/renderer'),
    import('jspdf')
  ]);
  
  const blob = await pdf(document).toBlob();
  // ... rest of code
}
```

---

### 3. PDF Components

For React PDF components, they're already lazy-loaded via React.lazy in your routes. No changes needed there.

---

## Implementation Steps

### Step 1: Update excelReport.ts
```bash
# Open file
code client/src/lib/excelReport.ts
```

Replace static import with dynamic:
```typescript
// Remove this line from top:
// import ExcelJS from 'exceljs';

// In your export function:
export async function exportToExcel(data: any[], filename: string) {
  const ExcelJS = await import('exceljs');
  
  const workbook = new ExcelJS.default.Workbook();
  const worksheet = workbook.addWorksheet('Data');
  
  // Rest of your code...
}
```

### Step 2: Update fileExport.ts
```bash
code client/src/lib/fileExport.ts
```

```typescript
// Remove static imports from top:
// import jsPDF from 'jspdf';
// import { pdf } from '@react-pdf/renderer';

export async function exportToPDF(document: any, filename: string) {
  const [{ pdf }, jsPDFModule] = await Promise.all([
    import('@react-pdf/renderer'),
    import('jspdf')
  ]);
  
  const jsPDF = jsPDFModule.default;
  const blob = await pdf(document).toBlob();
  
  // Rest of your code...
}
```

### Step 3: Update pdfFonts.ts (if used)
```typescript
// Change from:
import { Font } from '@react-pdf/renderer';

// To:
export async function registerFonts() {
  const { Font } = await import('@react-pdf/renderer');
  
  Font.register({
    family: 'Noto Sans',
    fonts: [
      // Your font registrations
    ]
  });
}
```

Then call `registerFonts()` before using PDF features.

---

## Expected Impact

### Before:
- Initial bundle includes: exceljs (931 KB) + react-pdf (844 KB) + jspdf (348 KB) = **2.1 MB**
- All loaded on page load
- Slower initial render

### After:
- Initial bundle: **0 KB** for these libraries
- Loaded only when user clicks "Export" or "Download PDF"
- Faster initial load by ~1-2 seconds on slow connections
- Better Lighthouse scores

---

## Testing

1. **Build the app:**
   ```bash
   cd client
   npm run build
   ```

2. **Check bundle size:**
   ```bash
   # Look at dist/assets - should see smaller main bundles
   ls -lh dist/assets/*.js | head -20
   ```

3. **Test functionality:**
   - Navigate to a page with export feature
   - Click export button
   - Verify it still works (library loads on-demand)
   - Check Network tab - should see chunk loading on click

4. **Run Lighthouse:**
   - Should see improved Speed Index and TTI scores

---

## Advanced: Route-Based Code Splitting

For even better performance, split by route:

```typescript
// In App.tsx or router config
const Reports = lazy(() => import('./pages/Reports'));
const Inventory = lazy(() => import('./pages/inventory/InventoryReports'));

// These routes won't load until visited
<Route path="/reports" element={<Reports />} />
<Route path="/inventory/reports" element={<Inventory />} />
```

You're already doing this with your lazy.ts file! ✅

---

## Monitoring Bundle Size

Add this to your build process to track sizes:

```json
// package.json
{
  "scripts": {
    "build:analyze": "npm run build && npx vite-bundle-analyzer dist"
  }
}
```

Install analyzer:
```bash
npm install --save-dev rollup-plugin-visualizer
```

Add to vite.config.ts:
```typescript
import { visualizer } from 'rollup-plugin-visualizer';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    visualizer({ open: true }) // Opens browser with visualization
  ]
});
```

---

## Summary

| Library | Size | Current | Optimized | Savings |
|---------|------|---------|-----------|---------|
| exceljs | 931 KB | Initial load | On-demand | ~931 KB |
| @react-pdf | 844 KB | Initial load | On-demand | ~844 KB |
| jspdf | 348 KB | Initial load | On-demand | ~348 KB |
| **Total** | **2.1 MB** | **Loaded upfront** | **Lazy** | **~2.1 MB** |

**Expected Performance Gain:**
- Initial load time: -1 to -2 seconds
- Speed Index: -0.5 to -1 second
- Better mobile performance
- Higher Lighthouse scores

---

## Next Steps After This

1. Implement lazy loading (30 min)
2. Rebuild and test
3. Run Lighthouse audit
4. Consider adding service worker for caching
5. Enable HTTP/2 on Apache
6. Add resource hints (already done above)
