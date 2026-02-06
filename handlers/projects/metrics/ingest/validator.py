def validator(event):
    if event is None:
        return {"status": 400, "message": "Missing event"}
    return {"status": 200}
