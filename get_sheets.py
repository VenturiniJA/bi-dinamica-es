import urllib.request
import re

req = urllib.request.Request('https://docs.google.com/spreadsheets/d/163X5ADTJkHXK4INVs4KPdAXveUXhz0sYEoDGIdHWdOM/edit?usp=sharing', headers={'User-Agent': 'Mozilla/5.0'})
html = urllib.request.urlopen(req).read().decode('utf-8')
names = set(re.findall(r'"name":"(.*?)"', html))
for n in names:
    print(n)
