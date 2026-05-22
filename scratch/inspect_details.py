import pandas as pd

def inspect_details():
    source_path = r"D:\my project\smacc db to excel\exports\products_only_verified\2026-05-19_214934\SMACCPOS_products_only.verified.xlsx"
    target_path = r"C:\Users\mhass\Downloads\items-import-template (3).xlsx"
    
    print("--- Source File Details ---")
    source_df = pd.read_excel(source_path)
    print("Shape:", source_df.shape)
    print("Columns:", source_df.columns.tolist())
    print("\nFirst 10 rows:")
    print(source_df.head(10).to_string())
    
    print("\n--- Target File Details ---")
    target_df = pd.read_excel(target_path, sheet_name=0)
    print("Shape:", target_df.shape)
    print("Columns:", target_df.columns.tolist())
    print("\nFirst 3 rows:")
    print(target_df.head(3).to_string())

if __name__ == "__main__":
    inspect_details()
