import pandas as pd
import openpyxl
import os

def convert_products():
    source_path = r"D:\my project\smacc db to excel\exports\products_only_verified\2026-05-19_214934\SMACCPOS_products_only.verified.xlsx"
    target_path = r"C:\Users\mhass\Downloads\items-import-template (3).xlsx"
    
    print("Starting conversion...")
    
    # 1. Load source data
    print("Reading source data...")
    df_src = pd.read_excel(
        source_path,
        dtype={
            'ItemCode': str,
            'ItemUnitCode': str,
            'ExtraCodes': str,
            'AllCodes': str
        }
    )
    print(f"Read {len(df_src)} rows from source.")
    
    # 2. Load target workbook
    print("Loading target template...")
    wb = openpyxl.load_workbook(target_path)
    sheet = wb['Items']
    
    # 3. Clear existing data rows (keep row 1 headers)
    max_row = sheet.max_row
    print(f"Template currently has {max_row} rows.")
    if max_row >= 2:
        print("Clearing sample data rows...")
        sheet.delete_rows(2, max_row - 1)
        
    # 4. Map and write rows
    print("Mapping and appending rows...")
    rows_added = 0
    
    for idx, row in df_src.iterrows():
        item_code = str(row['ItemCode']).strip() if pd.notnull(row['ItemCode']) else ''
        item_name = str(row['ItemName']).strip() if pd.notnull(row['ItemName']) else ''
        item_unit_code = str(row['ItemUnitCode']).strip() if pd.notnull(row['ItemUnitCode']) else ''
        unit_type = row['UnitType'] if pd.notnull(row['UnitType']) else 1
        unit_name = str(row['UnitName']).strip() if pd.notnull(row['UnitName']) else 'حبة'
        
        # Numeric parsing
        try:
            unit_fraction = float(row['UnitFraction']) if pd.notnull(row['UnitFraction']) else 1.0
        except ValueError:
            unit_fraction = 1.0
            
        try:
            cost_price = float(row['CostPrice']) if pd.notnull(row['CostPrice']) else 0.0
        except ValueError:
            cost_price = 0.0
            
        try:
            sale_price = float(row['PriceChannel_3']) if pd.notnull(row['PriceChannel_3']) else 0.0
        except ValueError:
            sale_price = 0.0
            
        # Is Base Unit
        is_base = 'YES' if (unit_fraction == 1.0 or unit_type == 1) else 'NO'
        
        # Barcodes extraction and deduplication
        barcodes = []
        if item_unit_code and len(item_unit_code) >= 6:
            barcodes.append(item_unit_code)
            
        extra_codes_raw = str(row['ExtraCodes']).strip() if pd.notnull(row['ExtraCodes']) else ''
        if extra_codes_raw:
            for code in extra_codes_raw.split('|'):
                code = code.strip()
                if code and code not in barcodes:
                    barcodes.append(code)
                    
        bar1 = barcodes[0] if len(barcodes) > 0 else None
        bar2 = barcodes[1] if len(barcodes) > 1 else None
        bar3 = barcodes[2] if len(barcodes) > 2 else None
        
        # Unit Code creation
        unit_code = f"{item_code}-{item_unit_code}" if item_unit_code else f"{item_code}-{idx}"
        
        # Append row to sheet
        sheet.append([
            item_code,           # 1. Item Code
            item_name,           # 2. Item Name (EN)
            item_name,           # 3. Item Name (AR)
            'General',           # 4. Group
            'General',           # 5. Category
            '',                  # 6. Brand
            15,                  # 7. Tax Rate % (Saudi Standard)
            'ACTIVE',            # 8. Item Status
            unit_name,           # 9. Unit Name
            unit_code,           # 10. Unit Code
            is_base,             # 11. Is Base Unit
            unit_fraction,       # 12. Fraction
            sale_price,          # 13. Sale Price
            cost_price,          # 14. Cost Price
            None,                # 15. Min Neg Price
            'ACTIVE',            # 16. Unit Status
            bar1,                # 17. Flavor Barcode 1
            bar2,                # 18. Flavor Barcode 2
            bar3                 # 19. Flavor Barcode 3
        ])
        rows_added += 1
        
    # 5. Save workbook
    print("Saving modified template...")
    wb.save(target_path)
    print(f"Successfully converted and saved {rows_added} rows to {target_path}!")

if __name__ == "__main__":
    convert_products()
