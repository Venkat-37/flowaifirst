try:
    from database import behavior_col
    print("SUCCESS: behavior_col imported successfully")
except ImportError as e:
    print(f"FAILURE: {e}")
except Exception as e:
    print(f"ERROR: {e}")
    