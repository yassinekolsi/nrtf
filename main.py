from fastapi import FastAPI

import models  # noqa: F401
from database import Base, engine

app = FastAPI(title="Hackathon Backend")


@app.on_event("startup")
def create_tables() -> None:
    Base.metadata.create_all(bind=engine)
