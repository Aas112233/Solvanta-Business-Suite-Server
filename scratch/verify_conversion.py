import pandas as pd

def verify():
    target_path = r"C:\Users\mhass\Downloads\items-import-template (3).xlsx"
    df = pd.read_excel(target_path, sheet_name=0)
    print("Shape of modified file:", df.shape)
    print("Columns:", df.columns.tolist())
    print("\nFirst 5 rows:")
    print(df.head(5).to_string())

if __name__ == "__main__":
    verify()
