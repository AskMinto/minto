import yfinance as yf
dat = yf.Ticker("MSFT")
print(dat.info)
look = yf.se