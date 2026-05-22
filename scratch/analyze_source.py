import pandas as pd

def analyze_source_data():
    source_path = r"D:\my project\smacc db to excel\exports\products_only_verified\2026-05-19_214934\SMACCPOS_products_only.verified.xlsx"
    df = pd.read_excel(source_path)
    
    print("Columns and data types:")
    print(df.dtypes)
    print("\nNull counts:")
    print(df.isnull().sum())
    
    print("\nSummary statistics of numeric columns:")
    print(df.describe())
    
    print("\nChecking non-null PriceChannel_3 values:")
    non_null_price = df[df['PriceChannel_3'].notnull()]
    print("Count of non-null PriceChannel_3:", len(non_null_price))
    if len(non_null_price) > 0:
        print(non_null_price.head(5).to_string())
        
    print("\nChecking non-null ExtraCodes values:")
    non_null_extra = df[df['ExtraCodes'].notnull()]
    print("Count of non-null ExtraCodes:", len(non_null_extra))
    if len(non_null_extra) > 0:
        print(non_null_extra.head(5).to_string())

if __name__ == "__main__":
    analyze_source_data()
