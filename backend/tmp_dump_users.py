import asyncio
import database

async def main():
    await database.connect_db()
    print("Users in DB:")
    async for u in database.users_col().find():
        # Remove _id and print
        u.pop("_id", None)
        print(u)
    await database.close_db()

if __name__ == "__main__":
    asyncio.run(main())
