#!/usr/bin/env python3
import csv
from io import StringIO
from urllib.request import urlopen


URL = "https://stooq.com/q/l/?s=amzn.us&i=d"


def main() -> None:
    with urlopen(URL, timeout=15) as response:
        raw = response.read().decode("utf-8").strip()

    row = next(csv.reader(StringIO(raw)))
    symbol, date, time, open_p, high, low, close, volume, *_ = row

    print(f"Symbol: {symbol}")
    print(f"Date: {date}")
    print(f"Time: {time}")
    print(f"Open: {open_p}")
    print(f"High: {high}")
    print(f"Low: {low}")
    print(f"Close: {close}")
    print(f"Volume: {volume}")


if __name__ == "__main__":
    main()
