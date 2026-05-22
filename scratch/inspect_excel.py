import pandas as pd
import json

def inspect_excel():
    source_path = r"D:\my project\smacc db to excel\exports\products_only_verified\2026-05-19_214934\SMACCPOS_products_only.verified.xlsx"
    target_path = r"C:\Users\mhass\Downloads\items-import-template (3).xlsx"
    
    print("--- Source File ---")
    try:
        source_df = pd.read_excel(source_path, nrows=5)
        print("Columns:")
        print(source_df.columns.tolist())
        print("\nFirst row:")
        print(source_df.iloc[0].to_dict() if not source_df.empty else "Empty")
    except Exception as e:
        print("Failed to read source:", str(e))
        
    print("\n--- Target File ---")
    try:
        # Check sheet names first
        xls = pd.ExcelFile(target_path)
        print("Sheet names:", xls.sheet_names)
        
        target_df = pd.read_excel(target_path, sheet_name=0, nrows=5)
        print("Columns:")
        print(target_df.columns.tolist())
        print("\nFirst row:")
        print(target_df.iloc[0].to_dict() if not target_df.empty else "Empty")
    except Exception as e:
        print("Failed to read target:", str(e))

if __name__ == "__main__":
    inspect_excel()
