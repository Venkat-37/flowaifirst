import traceback
try:
    import main
except Exception as e:
    with open("error_log.txt", "w") as f:
        traceback.print_exc(file=f)
    print("Error written to error_log.txt")
    print(f"Error: {e}")
