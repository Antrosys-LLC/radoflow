# Terminal IDs by employee

The number each person must be enrolled under on the biometric terminal, and what RadoFlow currently has stored against them.

When a terminal uploads a punch it sends **only this number**. RadoFlow looks it up in `device_enrollments` to decide whose day the punch belongs to. A number the terminal sends that RadoFlow does not recognise produces a punch attributed to nobody — the upload still returns success, the device deletes its copy, and the hours are gone.

|                           |                          |
| ------------------------- | ------------------------ |
| Active people             | 402                      |
| Stored ID already correct | 3                        |
| Stored ID needs fixing    | 399                      |
| Duplicate enrol numbers   | 0                        |
| Terminal                  | antrosys (QWC5254900090) |

## Why most rows below are marked wrong

**399 of 402 people have a terminal ID RadoFlow can never match.** They are stored with the employee code itself — `RD-2070` — but a ZKTeco terminal stores the user ID as a number and has no way to hold letters or a hyphen. The device sends `2070`, RadoFlow looks for `RD-2070`, and the punch is dropped.

This is not theoretical. SUBHAN (`RD-2070`) is already enrolled on the terminal and scanning; every one of their punches so far has been recorded against nobody. The two accounts that do map — enrolled as `1` and `2` — are the only ones stored as numbers.

**Enrol from the first column.** The last column is what RadoFlow holds today, and it needs correcting to match before the punches of anyone already enrolled will attach to them.

## Accounts · 10 people

| Enrol as | Employee code | Name          | Designation | Stored in RadoFlow |
| -------- | ------------- | ------------- | ----------- | ------------------ |
| **2015** | RD-2015       | TARIQ SAEED   | Manager     | `RD-2015` ✗        |
| **2016** | RD-2016       | TARIQ JAMIL   | Accountant  | `RD-2016` ✗        |
| **2017** | RD-2017       | M AZAM        | Purchser    | `RD-2017` ✗        |
| **2018** | RD-2018       | KASHIF JAVAID | Manager     | `RD-2018` ✗        |
| **2019** | RD-2019       | RANA TAJAMAL  | Accountant  | `RD-2019` ✗        |
| **2020** | RD-2020       | IRFAN AKHTER  | Accountant  | `RD-2020` ✗        |
| **2021** | RD-2021       | AHMED RAZA    | Accountant  | `RD-2021` ✗        |
| **2022** | RD-2022       | WAQAS         | Accountant  | `RD-2022` ✗        |
| **2023** | RD-2023       | TOQEER        | Asist.      | `RD-2023` ✗        |
| **2024** | RD-2024       | ASIF          | SOFT WEAR   | `RD-2024` ✗        |

## Admin · 16 people

| Enrol as | Employee code | Name            | Designation | Stored in RadoFlow |
| -------- | ------------- | --------------- | ----------- | ------------------ |
| **500**  | 500           | Arham Sethi     | —           | `500` ✓            |
| **2000** | RD-2000       | ISMAIL KHAN     | S Sup.      | `RD-2000` ✗        |
| **2001** | RD-2001       | MUSHTAQ         | Gate Sup.   | `RD-2001` ✗        |
| **2002** | RD-2002       | EHSAN ULLAH     | Gate Sup.   | `RD-2002` ✗        |
| **2003** | RD-2003       | MUHAMMAD KHALIL | G S 54      | `RD-2003` ✗        |
| **2004** | RD-2004       | FAREED BUX      | S/G         | `RD-2004` ✗        |
| **2005** | RD-2005       | SHAHID HUSSAIN  | Admin       | `RD-2005` ✗        |
| **2006** | RD-2006       | IQBAL ANWAR     | BARKI       | `RD-2006` ✗        |
| **2007** | RD-2007       | MALIK ZAMAN     | Stor keper  | `RD-2007` ✗        |
| **2008** | RD-2008       | AHMED KHAN      | Lab.Asst.   | `RD-2008` ✗        |
| **2009** | RD-2009       | M NADEEM        | Driver      | `RD-2009` ✗        |
| **2010** | RD-2010       | KHURAM          | Coal Mun.   | `RD-2010` ✗        |
| **2011** | RD-2011       | MAJID SHAH      | Cook        | `RD-2011` ✗        |
| **2012** | RD-2012       | SHEHRAZ         | Office Boy  | `RD-2012` ✗        |
| **2013** | RD-2013       | IMAM MASJID     | MASJID      | `RD-2013` ✗        |
| **2014** | RD-2014       | MAQBOOL         | S/MAN       | `RD-2014` ✗        |

## Ager Machine · 21 people

| Enrol as | Employee code | Name             | Designation | Stored in RadoFlow |
| -------- | ------------- | ---------------- | ----------- | ------------------ |
| **2266** | RD-2266       | MEHMOOD          | H OPT.      | `RD-2266` ✗        |
| **2267** | RD-2267       | GHULAM HUSSAIN   | OPERATOR    | `RD-2267` ✗        |
| **2268** | RD-2268       | AJAB KHAN        | OPERATOR    | `RD-2268` ✗        |
| **2269** | RD-2269       | UMER AZAZ        | OPERATOR    | `RD-2269` ✗        |
| **2270** | RD-2270       | ABU SUFFIAN      | ASIST       | `RD-2270` ✗        |
| **2271** | RD-2271       | SABAR REHMAN     | ASIST       | `RD-2271` ✗        |
| **2272** | RD-2272       | MAJID KHAN       | ASIST       | `RD-2272` ✗        |
| **2273** | RD-2273       | RAZA ULLAH       | S MAN       | `RD-2273` ✗        |
| **2274** | RD-2274       | NAEEM KHAN       | S MAN       | `RD-2274` ✗        |
| **2275** | RD-2275       | GULL HAYAT       | S MAN       | `RD-2275` ✗        |
| **2276** | RD-2276       | ZAIN UL ABEEDEEN | HELPER      | `RD-2276` ✗        |
| **2277** | RD-2277       | MUQADAS          | HELPER      | `RD-2277` ✗        |
| **2278** | RD-2278       | ASIM KHAN        | HELPER      | `RD-2278` ✗        |
| **2279** | RD-2279       | GULZAR           | HELPER      | `RD-2279` ✗        |
| **2280** | RD-2280       | IRFAN            | HELPER      | `RD-2280` ✗        |
| **2281** | RD-2281       | SAMI ULLAH       | HELPER      | `RD-2281` ✗        |
| **2282** | RD-2282       | MUBASHIR         | HELPER      | `RD-2282` ✗        |
| **2283** | RD-2283       | ISMAIL           | HELPER      | `RD-2283` ✗        |
| **2284** | RD-2284       | WAQAS            | HELPER      | `RD-2284` ✗        |
| **2285** | RD-2285       | SHAKIR           | HELPER      | `RD-2285` ✗        |
| **2286** | RD-2286       | YOUSAF           | HELPER      | `RD-2286` ✗        |

## Antrosys · 1 people

| Enrol as | Employee code | Name          | Designation | Stored in RadoFlow |
| -------- | ------------- | ------------- | ----------- | ------------------ |
| **2**    | 2             | Anas Antrosys | —           | `2` ✓              |

## Auto 01 · 17 people

| Enrol as | Employee code | Name           | Designation | Stored in RadoFlow |
| -------- | ------------- | -------------- | ----------- | ------------------ |
| **2185** | RD-2185       | HASSAN RAZA    | OPERATOR    | `RD-2185` ✗        |
| **2186** | RD-2186       | TAYYAB         | OPERATOR    | `RD-2186` ✗        |
| **2187** | RD-2187       | GHULAM HUSSAIN | H MAN       | `RD-2187` ✗        |
| **2188** | RD-2188       | SAFEEL         | H MAN       | `RD-2188` ✗        |
| **2189** | RD-2189       | UMEED ALI      | F MAN       | `RD-2189` ✗        |
| **2190** | RD-2190       | SADAM          | F MAN       | `RD-2190` ✗        |
| **2191** | RD-2191       | ZAHID          | F MAN       | `RD-2191` ✗        |
| **2192** | RD-2192       | ARIF           | F MAN       | `RD-2192` ✗        |
| **2193** | RD-2193       | IKHTYAR        | S MAN       | `RD-2193` ✗        |
| **2194** | RD-2194       | HANEEF         | HELPER      | `RD-2194` ✗        |
| **2195** | RD-2195       | JAVAID         | HELPER      | `RD-2195` ✗        |
| **2196** | RD-2196       | FIYAZ          | HELPER      | `RD-2196` ✗        |
| **2197** | RD-2197       | ARBAZ          | HELPER      | `RD-2197` ✗        |
| **2198** | RD-2198       | FIYAZ          | HELPER      | `RD-2198` ✗        |
| **2199** | RD-2199       | ALI GULL       | MANDI MAN   | `RD-2199` ✗        |
| **2200** | RD-2200       | ADIL MAQBOOL   | H MANDI     | `RD-2200` ✗        |
| **2201** | RD-2201       | CHAMAN         | H MANDI     | `RD-2201` ✗        |

## Auto 02 · 19 people

| Enrol as | Employee code | Name          | Designation | Stored in RadoFlow |
| -------- | ------------- | ------------- | ----------- | ------------------ |
| **2202** | RD-2202       | SHAHBIR       | OPERATOR    | `RD-2202` ✗        |
| **2203** | RD-2203       | BARKAT        | OPERATOR    | `RD-2203` ✗        |
| **2204** | RD-2204       | ADIL          | H MAN       | `RD-2204` ✗        |
| **2205** | RD-2205       | ABDUL NABI    | H MAN       | `RD-2205` ✗        |
| **2206** | RD-2206       | MUZAMIL       | F MAN       | `RD-2206` ✗        |
| **2207** | RD-2207       | JAVAID        | F MAN       | `RD-2207` ✗        |
| **2208** | RD-2208       | UMER FAROOQ   | F MAN       | `RD-2208` ✗        |
| **2209** | RD-2209       | MUZAFAR       | S MAN       | `RD-2209` ✗        |
| **2210** | RD-2210       | MAQSOOD       | S MAN       | `RD-2210` ✗        |
| **2211** | RD-2211       | SALAMAT       | HELPER      | `RD-2211` ✗        |
| **2212** | RD-2212       | BASHIR AHMED  | HELPER      | `RD-2212` ✗        |
| **2213** | RD-2213       | ABDUR RAHMEEM | HELPER      | `RD-2213` ✗        |
| **2214** | RD-2214       | ISHAQ         | HELPER      | `RD-2214` ✗        |
| **2215** | RD-2215       | QAMAR ULLAH   | HELPER      | `RD-2215` ✗        |
| **2216** | RD-2216       | HIZBULLHA     | HELPER      | `RD-2216` ✗        |
| **2217** | RD-2217       | MUNIR AHMED   | HELPER      | `RD-2217` ✗        |
| **2218** | RD-2218       | GULL AMEEN    | HELPER      | `RD-2218` ✗        |
| **2219** | RD-2219       | ZAHID         | MANDI MAN   | `RD-2219` ✗        |
| **2220** | RD-2220       | ISHFAQ        | MANDI MAN   | `RD-2220` ✗        |

## Boiler · 2 people

| Enrol as | Employee code | Name         | Designation | Stored in RadoFlow |
| -------- | ------------- | ------------ | ----------- | ------------------ |
| **2389** | RD-2389       | STEAM BOILER | 309760      | `RD-2389` ✗        |
| **2390** | RD-2390       | OIL BOILER   | 303710      | `RD-2390` ✗        |

## Bouzer · 12 people

| Enrol as | Employee code | Name           | Designation | Stored in RadoFlow |
| -------- | ------------- | -------------- | ----------- | ------------------ |
| **2140** | RD-2140       | TAQIQ MEHMOOD  | H OPT       | `RD-2140` ✗        |
| **2141** | RD-2141       | RIZWAN         | OPT         | `RD-2141` ✗        |
| **2142** | RD-2142       | SARFRAZ        | OPT         | `RD-2142` ✗        |
| **2143** | RD-2143       | MUSHTAQ AHMED  | ASIST       | `RD-2143` ✗        |
| **2144** | RD-2144       | ASAD FIRDOOS   | ASIST       | `RD-2144` ✗        |
| **2145** | RD-2145       | GHULAM MURTAZA | CHECKER     | `RD-2145` ✗        |
| **2146** | RD-2146       | SHAHKIL AHMED  | CHECKER     | `RD-2146` ✗        |
| **2147** | RD-2147       | ALI AKBAR      | PUMP MAN    | `RD-2147` ✗        |
| **2148** | RD-2148       | AMIR           | PUMP MAN    | `RD-2148` ✗        |
| **2149** | RD-2149       | ALI RAZA       | HELPER      | `RD-2149` ✗        |
| **2150** | RD-2150       | KHURAM         | HELPER      | `RD-2150` ✗        |
| **2151** | RD-2151       | SHOAIB         | HELPER      | `RD-2151` ✗        |

## Calander · 17 people

| Enrol as | Employee code | Name            | Designation | Stored in RadoFlow |
| -------- | ------------- | --------------- | ----------- | ------------------ |
| **2221** | RD-2221       | MOHSIN          | H OPT.      | `RD-2221` ✗        |
| **2222** | RD-2222       | AHSEN           | OPERATOR    | `RD-2222` ✗        |
| **2223** | RD-2223       | AHMED BAX       | OPERATOR    | `RD-2223` ✗        |
| **2224** | RD-2224       | SAEED NASEER    | OPERATOR    | `RD-2224` ✗        |
| **2225** | RD-2225       | HUSNAIN         | OPERATOR    | `RD-2225` ✗        |
| **2226** | RD-2226       | IBRAR           | ASIST.      | `RD-2226` ✗        |
| **2227** | RD-2227       | MALIK MEHMOOD   | ASIST.      | `RD-2227` ✗        |
| **2228** | RD-2228       | UBAID UR REHMAN | S/MAM       | `RD-2228` ✗        |
| **2229** | RD-2229       | YOUNAS          | HELPER      | `RD-2229` ✗        |
| **2230** | RD-2230       | NAVEED          | HELPER      | `RD-2230` ✗        |
| **2231** | RD-2231       | TAYAB           | HELPER      | `RD-2231` ✗        |
| **2232** | RD-2232       | RAMZAN          | HELPER      | `RD-2232` ✗        |
| **2233** | RD-2233       | AMIR            | HELPER      | `RD-2233` ✗        |
| **2234** | RD-2234       | SADAM           | HELPER      | `RD-2234` ✗        |
| **2235** | RD-2235       | IYAZ ALI        | HELPER      | `RD-2235` ✗        |
| **2236** | RD-2236       | HAMMAD          | HELPER      | `RD-2236` ✗        |
| **2237** | RD-2237       | FIDA HUSSAIN    | HELPER      | `RD-2237` ✗        |

## Color · 8 people

| Enrol as | Employee code | Name         | Designation | Stored in RadoFlow |
| -------- | ------------- | ------------ | ----------- | ------------------ |
| **2158** | RD-2158       | MEHBOOB ALAM | MASTER      | `RD-2158` ✗        |
| **2159** | RD-2159       | ABDUL JABBAR | APM         | `RD-2159` ✗        |
| **2160** | RD-2160       | IZHAR UL HAQ | APM         | `RD-2160` ✗        |
| **2161** | RD-2161       | RIAZ         | C MAN       | `RD-2161` ✗        |
| **2162** | RD-2162       | JAN ALAM     | C MAN       | `RD-2162` ✗        |
| **2163** | RD-2163       | TAHIR        | ACM         | `RD-2163` ✗        |
| **2164** | RD-2164       | JAN ALI      | MANDI MAN   | `RD-2164` ✗        |
| **2165** | RD-2165       | M ASAD       | HELPER      | `RD-2165` ✗        |

## Creation · 19 people

| Enrol as | Employee code | Name            | Designation | Stored in RadoFlow |
| -------- | ------------- | --------------- | ----------- | ------------------ |
| **2063** | RD-2063       | M MANSOOR ALAM  | Incharge    | `RD-2063` ✗        |
| **2064** | RD-2064       | MOHSIN HAMEED   | Asist.      | `RD-2064` ✗        |
| **2065** | RD-2065       | SHAHBIR HUSSAIN | Production  | `RD-2065` ✗        |
| **2066** | RD-2066       | AHAD            | Production  | `RD-2066` ✗        |
| **2067** | RD-2067       | GHULAM FAREED   | Tracer      | `RD-2067` ✗        |
| **2068** | RD-2068       | HUSSAN ALI      | Tracer      | `RD-2068` ✗        |
| **2069** | RD-2069       | FAHAD SAMEER    | Tracer      | `RD-2069` ✗        |
| **2070** | RD-2070       | SUBHAN          | Tracer      | `RD-2070` ✗        |
| **2071** | RD-2071       | UMER NADEEM     | Tracer      | `RD-2071` ✗        |
| **2072** | RD-2072       | IRAJ            | Designer    | `RD-2072` ✗        |
| **2073** | RD-2073       | MARIUM SHOUKAT  | Designer    | `RD-2073` ✗        |
| **2074** | RD-2074       | IRSA            | Designer    | `RD-2074` ✗        |
| **2075** | RD-2075       | ASAD            | Designer    | `RD-2075` ✗        |
| **2076** | RD-2076       | VAJIHA          | Designer    | `RD-2076` ✗        |
| **2077** | RD-2077       | ADEEL MAJEED    | Designer    | `RD-2077` ✗        |
| **2078** | RD-2078       | UMER MANSAB     | Designer    | `RD-2078` ✗        |
| **2079** | RD-2079       | ASIM ALI        | Designer    | `RD-2079` ✗        |
| **2080** | RD-2080       | NOOR ZAINAB     | Designer    | `RD-2080` ✗        |
| **2081** | RD-2081       | USMAN FAROOQ    | IT          | `RD-2081` ✗        |

## Digital Machine · 70 people

| Enrol as | Employee code | Name             | Designation  | Stored in RadoFlow |
| -------- | ------------- | ---------------- | ------------ | ------------------ |
| **2317** | RD-2317       | SHEHROOZ KHAN    | HOUSE RENT   | `RD-2317` ✗        |
| **2318** | RD-2318       | SHEHROOZ KHAN    | INCHARGE     | `RD-2318` ✗        |
| **2319** | RD-2319       | JUNAID           | ASIST.       | `RD-2319` ✗        |
| **2320** | RD-2320       | ALI RAZA         | SHIF INCHARG | `RD-2320` ✗        |
| **2321** | RD-2321       | SAEED MEHMOOD    | SHIF INCHARG | `RD-2321` ✗        |
| **2322** | RD-2322       | WASEEM SADIQ     | SHIF INCHARG | `RD-2322` ✗        |
| **2323** | RD-2323       | ALEEM ISHFAQ     | SHIF INCHARG | `RD-2323` ✗        |
| **2324** | RD-2324       | NAUMAN           | ENG.         | `RD-2324` ✗        |
| **2325** | RD-2325       | M SHAHID         | DESIGNER     | `RD-2325` ✗        |
| **2326** | RD-2326       | HASEEB           | DESIGNER     | `RD-2326` ✗        |
| **2327** | RD-2327       | IFRAHIM          | DESIGNER     | `RD-2327` ✗        |
| **2328** | RD-2328       | NAEEM LIAQAT     | OPERATOR     | `RD-2328` ✗        |
| **2329** | RD-2329       | EHSAN            | OPERATOR     | `RD-2329` ✗        |
| **2330** | RD-2330       | M WASEEM YASINE  | OPERATOR     | `RD-2330` ✗        |
| **2331** | RD-2331       | HUNNAIN ANWER    | OPERATOR     | `RD-2331` ✗        |
| **2332** | RD-2332       | M HUSSAIN        | OPERATOR     | `RD-2332` ✗        |
| **2333** | RD-2333       | AHMED            | OPERATOR     | `RD-2333` ✗        |
| **2334** | RD-2334       | MANZAR ABBAS     | OPERATOR     | `RD-2334` ✗        |
| **2335** | RD-2335       | TAYYAB           | OPERATOR     | `RD-2335` ✗        |
| **2336** | RD-2336       | SAIF ULLAH       | OPERATOR     | `RD-2336` ✗        |
| **2337** | RD-2337       | AWAIS RAZA       | OPERATOR     | `RD-2337` ✗        |
| **2338** | RD-2338       | HUMZA AKRAM      | OPERATOR     | `RD-2338` ✗        |
| **2339** | RD-2339       | DANISH           | OPERATOR     | `RD-2339` ✗        |
| **2340** | RD-2340       | AQIB             | OPERATOR     | `RD-2340` ✗        |
| **2341** | RD-2341       | M ZUZBAIR        | OPERATOR     | `RD-2341` ✗        |
| **2342** | RD-2342       | SAJID ALI        | OPERATOR     | `RD-2342` ✗        |
| **2343** | RD-2343       | AMIR SAEED       | OPERATOR     | `RD-2343` ✗        |
| **2344** | RD-2344       | AQIB             | ASIST OPT.   | `RD-2344` ✗        |
| **2345** | RD-2345       | ATIF ARSHAD      | ASIST OPT.   | `RD-2345` ✗        |
| **2346** | RD-2346       | REHAN            | ASIST OPT.   | `RD-2346` ✗        |
| **2347** | RD-2347       | M ABU BAKAR      | ASIST OPT.   | `RD-2347` ✗        |
| **2348** | RD-2348       | IMTIAZ           | ASIST OPT.   | `RD-2348` ✗        |
| **2349** | RD-2349       | SHEHROZ YASINE   | ASIST OPT.   | `RD-2349` ✗        |
| **2350** | RD-2350       | MATLOOB ALI      | ASIST OPT.   | `RD-2350` ✗        |
| **2351** | RD-2351       | SAIF ULLAH       | ASIST OPT.   | `RD-2351` ✗        |
| **2352** | RD-2352       | MUSHTAQ          | ASIST OPT.   | `RD-2352` ✗        |
| **2353** | RD-2353       | SHEHBAZ          | ASIST OPT.   | `RD-2353` ✗        |
| **2354** | RD-2354       | RANA PHOOL       | ASIST OPT.   | `RD-2354` ✗        |
| **2355** | RD-2355       | ALI ASLAM        | ASIST OPT.   | `RD-2355` ✗        |
| **2356** | RD-2356       | HUSNAIN          | ASIST OPT.   | `RD-2356` ✗        |
| **2357** | RD-2357       | HASEEB ULLAH     | ASIST OPT.   | `RD-2357` ✗        |
| **2358** | RD-2358       | IMTIAZ AHMED     | ASIST OPT.   | `RD-2358` ✗        |
| **2359** | RD-2359       | AMJAD            | CHECKER      | `RD-2359` ✗        |
| **2360** | RD-2360       | AZEEM            | CHECKER      | `RD-2360` ✗        |
| **2361** | RD-2361       | ABUSUFIAN        | CHECKER      | `RD-2361` ✗        |
| **2362** | RD-2362       | GHULAM MUSTAFA   | CHECKER      | `RD-2362` ✗        |
| **2363** | RD-2363       | UMER TARIQ       | CHECKER      | `RD-2363` ✗        |
| **2364** | RD-2364       | MOHSIN ALI       | CHECKER      | `RD-2364` ✗        |
| **2365** | RD-2365       | ALI HUSSAN       | CHECKER      | `RD-2365` ✗        |
| **2366** | RD-2366       | HASEEB UR REHMAN | CHECKER      | `RD-2366` ✗        |
| **2367** | RD-2367       | SHAIQ            | CHECKER      | `RD-2367` ✗        |
| **2368** | RD-2368       | KALEEM ULLAH     | SWEEPER      | `RD-2368` ✗        |
| **2369** | RD-2369       | UZAIR AHMED      | HELPER       | `RD-2369` ✗        |
| **2370** | RD-2370       | ZUBAIR RIAZ      | HELPER       | `RD-2370` ✗        |
| **2371** | RD-2371       | USMAN            | HELPER       | `RD-2371` ✗        |
| **2372** | RD-2372       | ARSLAN           | HELPER       | `RD-2372` ✗        |
| **2373** | RD-2373       | ARYAN ALI        | HELPER       | `RD-2373` ✗        |
| **2374** | RD-2374       | RAFAQAT          | HELPER       | `RD-2374` ✗        |
| **2375** | RD-2375       | HUSSAN ALI       | HELPER       | `RD-2375` ✗        |
| **2376** | RD-2376       | AHSEN            | HELPER       | `RD-2376` ✗        |
| **2377** | RD-2377       | SAD KHAN         | HELPER       | `RD-2377` ✗        |
| **2378** | RD-2378       | RANA HUSSAIN     | HELPER       | `RD-2378` ✗        |
| **2379** | RD-2379       | HUMZA            | HELPER       | `RD-2379` ✗        |
| **2380** | RD-2380       | ZAMEER           | HELPER       | `RD-2380` ✗        |
| **2381** | RD-2381       | EHTSHAM          | HELPER       | `RD-2381` ✗        |
| **2382** | RD-2382       | HUSSAN ABDULLAH  | HELPER       | `RD-2382` ✗        |
| **2383** | RD-2383       | ASAD PERWAIZ     | HELPER       | `RD-2383` ✗        |
| **2384** | RD-2384       | M NAVEED         | HELPER       | `RD-2384` ✗        |
| **2385** | RD-2385       | AZHAR HAYYAT     | HELPER       | `RD-2385` ✗        |
| **2386** | RD-2386       | M JAVEED         | HELPER       | `RD-2386` ✗        |

## Digital Mandi Man · 4 people

| Enrol as | Employee code | Name          | Designation | Stored in RadoFlow |
| -------- | ------------- | ------------- | ----------- | ------------------ |
| **2181** | RD-2181       | SAJID         | MANDI MAN   | `RD-2181` ✗        |
| **2182** | RD-2182       | JAVAID BASHIR | MANDI MAN   | `RD-2182` ✗        |
| **2183** | RD-2183       | ABID          | HELPER      | `RD-2183` ✗        |
| **2184** | RD-2184       | SABAR REHMAN  | HELPER      | `RD-2184` ✗        |

## Electric · 9 people

| Enrol as | Employee code | Name          | Designation  | Stored in RadoFlow |
| -------- | ------------- | ------------- | ------------ | ------------------ |
| **2045** | RD-2045       | SHAHKIL       | Incharge     | `RD-2045` ✗        |
| **2046** | RD-2046       | SHEHZAD AHMED | G Opt.       | `RD-2046` ✗        |
| **2047** | RD-2047       | NAVEED AHMED  | Asist.       | `RD-2047` ✗        |
| **2048** | RD-2048       | TAYYAB        | Electrition  | `RD-2048` ✗        |
| **2049** | RD-2049       | SADAAM        | Electrition  | `RD-2049` ✗        |
| **2050** | RD-2050       | HASSAN        | Electrition  | `RD-2050` ✗        |
| **2051** | RD-2051       | ABUBAKAR      | Electrition  | `RD-2051` ✗        |
| **2052** | RD-2052       | SHAHBAZ       | Motor Vinder | `RD-2052` ✗        |
| **2053** | RD-2053       | ARSLAN        | Helper       | `RD-2053` ✗        |

## Engraving · 6 people

| Enrol as | Employee code | Name          | Designation | Stored in RadoFlow |
| -------- | ------------- | ------------- | ----------- | ------------------ |
| **2152** | RD-2152       | IMRAN         | DESIGNER    | `RD-2152` ✗        |
| **2153** | RD-2153       | GHULAM RASOOL | EXPOSER     | `RD-2153` ✗        |
| **2154** | RD-2154       | MUZAMIL       | EXPOSER     | `RD-2154` ✗        |
| **2155** | RD-2155       | ALLAH RAKHA   | ASIST       | `RD-2155` ✗        |
| **2156** | RD-2156       | HUSNAIN       | ASIST       | `RD-2156` ✗        |
| **2157** | RD-2157       | BILAL         | HELPER      | `RD-2157` ✗        |

## Folding · 1 people

| Enrol as | Employee code | Name  | Designation | Stored in RadoFlow |
| -------- | ------------- | ----- | ----------- | ------------------ |
| **2392** | RD-2392       | TARIQ | 277200      | `RD-2392` ✗        |

## GM · 1 people

| Enrol as | Employee code | Name      | Designation | Stored in RadoFlow |
| -------- | ------------- | --------- | ----------- | ------------------ |
| **2391** | RD-2391       | ANWAR SB. | 330000      | `RD-2391` ✗        |

## Jigger Drawing · 12 people

| Enrol as | Employee code | Name        | Designation | Stored in RadoFlow |
| -------- | ------------- | ----------- | ----------- | ------------------ |
| **2305** | RD-2305       | SULIMAN     | OPERATOR    | `RD-2305` ✗        |
| **2306** | RD-2306       | SYED SHOAIB | OPERATOR    | `RD-2306` ✗        |
| **2307** | RD-2307       | QAISER      | HELPER      | `RD-2307` ✗        |
| **2308** | RD-2308       | RAMZAN      | HELPER      | `RD-2308` ✗        |
| **2309** | RD-2309       | MAJEED      | HELPER      | `RD-2309` ✗        |
| **2310** | RD-2310       | YAQOOB      | HELPER      | `RD-2310` ✗        |
| **2311** | RD-2311       | ISHAQ       | HELPER      | `RD-2311` ✗        |
| **2312** | RD-2312       | UMER HAYAT  | HELPER      | `RD-2312` ✗        |
| **2313** | RD-2313       | UMAIR HAYAT | HELPER      | `RD-2313` ✗        |
| **2314** | RD-2314       | SAEED AHMED | HELPER      | `RD-2314` ✗        |
| **2315** | RD-2315       | JAVAID      | HELPER      | `RD-2315` ✗        |
| **2316** | RD-2316       | SHOAIB      | HELPER      | `RD-2316` ✗        |

## Jigger Dyeing · 18 people

| Enrol as | Employee code | Name          | Designation | Stored in RadoFlow |
| -------- | ------------- | ------------- | ----------- | ------------------ |
| **2287** | RD-2287       | NUMAN SHAH    | MASTER      | `RD-2287` ✗        |
| **2288** | RD-2288       | QASIM         | SUPERVISOR  | `RD-2288` ✗        |
| **2289** | RD-2289       | FAISAL        | SUPERVISOR  | `RD-2289` ✗        |
| **2290** | RD-2290       | AHMAD SHAH    | COLOR MAN   | `RD-2290` ✗        |
| **2291** | RD-2291       | ADNAN         | COLOR MAN   | `RD-2291` ✗        |
| **2292** | RD-2292       | SHAHBIR AHMED | S/MAN       | `RD-2292` ✗        |
| **2293** | RD-2293       | ZOHAIB        | OPERATOR    | `RD-2293` ✗        |
| **2294** | RD-2294       | IMTIAZ        | OPERATOR    | `RD-2294` ✗        |
| **2295** | RD-2295       | AMIR RAZA     | OPERATOR    | `RD-2295` ✗        |
| **2296** | RD-2296       | NIYAZ         | OPERATOR    | `RD-2296` ✗        |
| **2297** | RD-2297       | MATLOOB       | OPERATOR    | `RD-2297` ✗        |
| **2298** | RD-2298       | SHEHBAZ SHAH  | OPERATOR    | `RD-2298` ✗        |
| **2299** | RD-2299       | SAMI ULLAH    | OPERATOR    | `RD-2299` ✗        |
| **2300** | RD-2300       | AQEEL         | OPERATOR    | `RD-2300` ✗        |
| **2301** | RD-2301       | FASHEE MADNI  | OPERATOR    | `RD-2301` ✗        |
| **2302** | RD-2302       | ADBDUL RAZAQ  | OPERATOR    | `RD-2302` ✗        |
| **2303** | RD-2303       | WAQAS         | OPERATOR    | `RD-2303` ✗        |
| **2304** | RD-2304       | MUNAWAR       | OPERATOR    | `RD-2304` ✗        |

## Kara Drawing · 16 people

| Enrol as | Employee code | Name          | Designation | Stored in RadoFlow |
| -------- | ------------- | ------------- | ----------- | ------------------ |
| **2110** | RD-2110       | BILAL NAZEER  | OPERATOR    | `RD-2110` ✗        |
| **2111** | RD-2111       | ABDUR REHMAN  | OPERATOR    | `RD-2111` ✗        |
| **2112** | RD-2112       | JAMSHAID      | OPERATOR    | `RD-2112` ✗        |
| **2113** | RD-2113       | NADEEM        | S/MAN       | `RD-2113` ✗        |
| **2114** | RD-2114       | AMJAD         | HELPER      | `RD-2114` ✗        |
| **2115** | RD-2115       | SHAHKIL       | HELPER      | `RD-2115` ✗        |
| **2116** | RD-2116       | ASHRAF        | HELPER      | `RD-2116` ✗        |
| **2117** | RD-2117       | ZAHOOR        | HELPER      | `RD-2117` ✗        |
| **2118** | RD-2118       | SOHAIL        | HELPER      | `RD-2118` ✗        |
| **2119** | RD-2119       | JAMIL         | HELPER      | `RD-2119` ✗        |
| **2120** | RD-2120       | ZAIN          | HELPER      | `RD-2120` ✗        |
| **2121** | RD-2121       | MUJAHID       | HELPER      | `RD-2121` ✗        |
| **2122** | RD-2122       | KAIR ULLAH    | HELPER      | `RD-2122` ✗        |
| **2123** | RD-2123       | QAMAR ZAMAN   | HELPER      | `RD-2123` ✗        |
| **2124** | RD-2124       | WASEEM SAJJAD | HELPER      | `RD-2124` ✗        |
| **2125** | RD-2125       | ABDULLAH      | HELPER      | `RD-2125` ✗        |

## Kare · 21 people

| Enrol as | Employee code | Name          | Designation | Stored in RadoFlow |
| -------- | ------------- | ------------- | ----------- | ------------------ |
| **2082** | RD-2082       | JAVAID        | B/M         | `RD-2082` ✗        |
| **2083** | RD-2083       | M RAFIQUE     | SUPERVISOR  | `RD-2083` ✗        |
| **2084** | RD-2084       | AHMET ZUBAIR  | SUPERVISOR  | `RD-2084` ✗        |
| **2085** | RD-2085       | NASEER AHMED  | K/MAN       | `RD-2085` ✗        |
| **2086** | RD-2086       | SOHAIL SADIQ  | K/MAN       | `RD-2086` ✗        |
| **2087** | RD-2087       | SULIMAN       | M MAN       | `RD-2087` ✗        |
| **2088** | RD-2088       | BABAR ALI     | M MAN       | `RD-2088` ✗        |
| **2089** | RD-2089       | IMRAN         | M MAN       | `RD-2089` ✗        |
| **2090** | RD-2090       | SALMAN ALI    | M MAN       | `RD-2090` ✗        |
| **2091** | RD-2091       | M ZAHOOR      | LOADER      | `RD-2091` ✗        |
| **2092** | RD-2092       | ZEESHAN       | LOADER      | `RD-2092` ✗        |
| **2093** | RD-2093       | ALI MURAD     | LOADER      | `RD-2093` ✗        |
| **2094** | RD-2094       | ABDULLAH      | LOADER      | `RD-2094` ✗        |
| **2095** | RD-2095       | SANA ULLAH    | LOADER      | `RD-2095` ✗        |
| **2096** | RD-2096       | M DAWOOD      | LOADER      | `RD-2096` ✗        |
| **2097** | RD-2097       | ABDUL SAMAD   | LOADER      | `RD-2097` ✗        |
| **2098** | RD-2098       | M IQBAL       | HELPER      | `RD-2098` ✗        |
| **2099** | RD-2099       | WAJID HUSSAIN | HELPER      | `RD-2099` ✗        |
| **2100** | RD-2100       | REHMAT ULLAH  | HELPER      | `RD-2100` ✗        |
| **2101** | RD-2101       | SHAH ZAIB     | HELPER      | `RD-2101` ✗        |
| **2102** | RD-2102       | SAIF ULLAH    | HELPER      | `RD-2102` ✗        |

## Kora · 8 people

| Enrol as | Employee code | Name      | Designation | Stored in RadoFlow |
| -------- | ------------- | --------- | ----------- | ------------------ |
| **2025** | RD-2025       | SAJID ALI | Incharge    | `RD-2025` ✗        |
| **2026** | RD-2026       | NISAR     | Asist.      | `RD-2026` ✗        |
| **2027** | RD-2027       | RIAZ      | S/Man       | `RD-2027` ✗        |
| **2028** | RD-2028       | SAJJAD    | S/Man       | `RD-2028` ✗        |
| **2029** | RD-2029       | FAISAL    | Mark Man    | `RD-2029` ✗        |
| **2030** | RD-2030       | IJAZ      | P/Man       | `RD-2030` ✗        |
| **2031** | RD-2031       | RASHID    | P/Man       | `RD-2031` ✗        |
| **2032** | RD-2032       | FAROOQ    | Gazanaman   | `RD-2032` ✗        |

## Mercrize · 14 people

| Enrol as | Employee code | Name         | Designation | Stored in RadoFlow |
| -------- | ------------- | ------------ | ----------- | ------------------ |
| **2126** | RD-2126       | M QAISER     | H OPT       | `RD-2126` ✗        |
| **2127** | RD-2127       | ALI SHAHN    | OPT.        | `RD-2127` ✗        |
| **2128** | RD-2128       | SOJAN        | OPT.        | `RD-2128` ✗        |
| **2129** | RD-2129       | HUAZIFA      | OPT.        | `RD-2129` ✗        |
| **2130** | RD-2130       | AMIR         | F MAN       | `RD-2130` ✗        |
| **2131** | RD-2131       | HUZAIFA      | HELPER      | `RD-2131` ✗        |
| **2132** | RD-2132       | MUZAMIL      | HELPER      | `RD-2132` ✗        |
| **2133** | RD-2133       | SHOAIB       | HELPER      | `RD-2133` ✗        |
| **2134** | RD-2134       | ABDUL SABOOR | HELPER      | `RD-2134` ✗        |
| **2135** | RD-2135       | ABDUL BASEER | HELPER      | `RD-2135` ✗        |
| **2136** | RD-2136       | WAZEER       | HELPER      | `RD-2136` ✗        |
| **2137** | RD-2137       | SANA ULLAH   | HELPER      | `RD-2137` ✗        |
| **2138** | RD-2138       | RAMZAN       | HELPER      | `RD-2138` ✗        |
| **2139** | RD-2139       | IMDAD        | HELPER      | `RD-2139` ✗        |

## PPC · 2 people

| Enrol as | Employee code | Name    | Designation | Stored in RadoFlow |
| -------- | ------------- | ------- | ----------- | ------------------ |
| **2387** | RD-2387       | ZAHID   | PPC.        | `RD-2387` ✗        |
| **2388** | RD-2388       | DANIYAL | ASIST. PPC  | `RD-2388` ✗        |

## Singing · 7 people

| Enrol as | Employee code | Name         | Designation | Stored in RadoFlow |
| -------- | ------------- | ------------ | ----------- | ------------------ |
| **2103** | RD-2103       | MUZAFAR ALI  | OPT.        | `RD-2103` ✗        |
| **2104** | RD-2104       | RASHID       | OPT.        | `RD-2104` ✗        |
| **2105** | RD-2105       | M ISMAIL     | HELPER      | `RD-2105` ✗        |
| **2106** | RD-2106       | IKRAM        | HELPER      | `RD-2106` ✗        |
| **2107** | RD-2107       | ALLAH DITTA  | HELPER      | `RD-2107` ✗        |
| **2108** | RD-2108       | NASIR        | HELPER      | `RD-2108` ✗        |
| **2109** | RD-2109       | AMEEN BASHIR | HELPER      | `RD-2109` ✗        |

## Sooper · 18 people

| Enrol as | Employee code | Name           | Designation | Stored in RadoFlow |
| -------- | ------------- | -------------- | ----------- | ------------------ |
| **2238** | RD-2238       | ABID HUSSAIN   | H OPT.      | `RD-2238` ✗        |
| **2239** | RD-2239       | SAIF ULLAH     | OPERATOR    | `RD-2239` ✗        |
| **2240** | RD-2240       | USMAN          | OPERATOR    | `RD-2240` ✗        |
| **2241** | RD-2241       | MOHSIN ALI     | OPERATOR    | `RD-2241` ✗        |
| **2242** | RD-2242       | BILAL          | F MAN       | `RD-2242` ✗        |
| **2243** | RD-2243       | SUNNY WAQAR    | F MAN       | `RD-2243` ✗        |
| **2244** | RD-2244       | SHAKEEB        | F MAN       | `RD-2244` ✗        |
| **2245** | RD-2245       | GHULAM MUSTAFA | F MAN       | `RD-2245` ✗        |
| **2246** | RD-2246       | YOUSAF         | S MAN       | `RD-2246` ✗        |
| **2247** | RD-2247       | AMEEN          | S MAN       | `RD-2247` ✗        |
| **2248** | RD-2248       | AMEEN BASHIR   | S MAN       | `RD-2248` ✗        |
| **2249** | RD-2249       | FAIZAN SALAMAT | HELPER      | `RD-2249` ✗        |
| **2250** | RD-2250       | HAMID KHAN     | HELPER      | `RD-2250` ✗        |
| **2251** | RD-2251       | DANISH         | HELPER      | `RD-2251` ✗        |
| **2252** | RD-2252       | REHAN          | HELPER      | `RD-2252` ✗        |
| **2253** | RD-2253       | ZAKIR          | HELPER      | `RD-2253` ✗        |
| **2254** | RD-2254       | ASIF           | HELPER      | `RD-2254` ✗        |
| **2255** | RD-2255       | AHMED          | HELPER      | `RD-2255` ✗        |

## Suntex · 15 people

| Enrol as | Employee code | Name          | Designation | Stored in RadoFlow |
| -------- | ------------- | ------------- | ----------- | ------------------ |
| **2166** | RD-2166       | ABDUL GHAFFAR | F MASTER    | `RD-2166` ✗        |
| **2167** | RD-2167       | ABID          | SUPERVISOR  | `RD-2167` ✗        |
| **2168** | RD-2168       | LIAQAT        | H OPT.      | `RD-2168` ✗        |
| **2169** | RD-2169       | ABDUL MAJEED  | H OPT.      | `RD-2169` ✗        |
| **2170** | RD-2170       | NAVEED        | OPT.        | `RD-2170` ✗        |
| **2171** | RD-2171       | GHULAM ALI    | H MAN       | `RD-2171` ✗        |
| **2172** | RD-2172       | AHAD          | H MAN       | `RD-2172` ✗        |
| **2173** | RD-2173       | MANSAB        | F MAN       | `RD-2173` ✗        |
| **2174** | RD-2174       | SALEEM        | F MAN       | `RD-2174` ✗        |
| **2175** | RD-2175       | AMIR          | S/M         | `RD-2175` ✗        |
| **2176** | RD-2176       | KASHIF        | S/M         | `RD-2176` ✗        |
| **2177** | RD-2177       | ADNAN         | HELPER      | `RD-2177` ✗        |
| **2178** | RD-2178       | JALIL AHMED   | HELPER      | `RD-2178` ✗        |
| **2179** | RD-2179       | IMTIAZ        | HELPER      | `RD-2179` ✗        |
| **2180** | RD-2180       | IRFAN         | HELPER      | `RD-2180` ✗        |

## Sweepers · 4 people

| Enrol as | Employee code | Name     | Designation | Stored in RadoFlow |
| -------- | ------------- | -------- | ----------- | ------------------ |
| **2395** | RD-2395       | SAJIN    | INCHARG     | `RD-2395` ✗        |
| **2396** | RD-2396       | ASIF     | HELPER      | `RD-2396` ✗        |
| **2397** | RD-2397       | SARWAR   | HELPER      | `RD-2397` ✗        |
| **2398** | RD-2398       | ALI RAZA | HELPER      | `RD-2398` ✗        |

## Tayyar Store · 12 people

| Enrol as | Employee code | Name           | Designation | Stored in RadoFlow |
| -------- | ------------- | -------------- | ----------- | ------------------ |
| **2033** | RD-2033       | KAMIL          | Munshi      | `RD-2033` ✗        |
| **2034** | RD-2034       | NAVEED         | Asist.      | `RD-2034` ✗        |
| **2035** | RD-2035       | TAHIR          | Loader      | `RD-2035` ✗        |
| **2036** | RD-2036       | SHAFAT ULLAH   | Munshi      | `RD-2036` ✗        |
| **2037** | RD-2037       | ISHTIAQ        | Loader      | `RD-2037` ✗        |
| **2038** | RD-2038       | JAMIL          | Loader      | `RD-2038` ✗        |
| **2039** | RD-2039       | ISHAQ          | Loader      | `RD-2039` ✗        |
| **2040** | RD-2040       | ALLAH WASYA    | Asist.      | `RD-2040` ✗        |
| **2041** | RD-2041       | ABID SULTAN    | Munshi      | `RD-2041` ✗        |
| **2042** | RD-2042       | VISHAL         | Asist.      | `RD-2042` ✗        |
| **2043** | RD-2043       | UMAIR          | Asist.      | `RD-2043` ✗        |
| **2044** | RD-2044       | NASEER HUSSAIN | Loader      | `RD-2044` ✗        |

## Unassigned · 1 people

| Enrol as | Employee code | Name    | Designation | Stored in RadoFlow |
| -------- | ------------- | ------- | ----------- | ------------------ |
| **1**    | RD-0001       | UmarCEO | —           | `1` ✓              |

## Vench · 10 people

| Enrol as | Employee code | Name          | Designation | Stored in RadoFlow |
| -------- | ------------- | ------------- | ----------- | ------------------ |
| **2256** | RD-2256       | TARIQ         | OPERATOR    | `RD-2256` ✗        |
| **2257** | RD-2257       | ZAHEER        | OPERATOR    | `RD-2257` ✗        |
| **2258** | RD-2258       | ALI           | ASIST       | `RD-2258` ✗        |
| **2259** | RD-2259       | AKBAR         | ASIST       | `RD-2259` ✗        |
| **2260** | RD-2260       | NAEEM         | HELPER      | `RD-2260` ✗        |
| **2261** | RD-2261       | ABDUR RAZAQ   | HELPER      | `RD-2261` ✗        |
| **2262** | RD-2262       | KAFEEL KHAN   | HELPER      | `RD-2262` ✗        |
| **2263** | RD-2263       | KHALID REHMAN | HELPER      | `RD-2263` ✗        |
| **2264** | RD-2264       | ASIM KHAN     | HELPER      | `RD-2264` ✗        |
| **2265** | RD-2265       | ABDULLAH      | HELPER      | `RD-2265` ✗        |

## Workshop · 9 people

| Enrol as | Employee code | Name           | Designation | Stored in RadoFlow |
| -------- | ------------- | -------------- | ----------- | ------------------ |
| **2054** | RD-2054       | SALAMAT        | Incharge    | `RD-2054` ✗        |
| **2055** | RD-2055       | SAJID          | Welder      | `RD-2055` ✗        |
| **2056** | RD-2056       | IRFAN          | Fitter      | `RD-2056` ✗        |
| **2057** | RD-2057       | KASHIF         | Fitter      | `RD-2057` ✗        |
| **2058** | RD-2058       | KARAMAT ALI    | Fitter      | `RD-2058` ✗        |
| **2059** | RD-2059       | MUZAMIL        | Fitter      | `RD-2059` ✗        |
| **2060** | RD-2060       | H SHAN ALI     | Fitter      | `RD-2060` ✗        |
| **2061** | RD-2061       | SHEHBAZ HAIDER | Fitter      | `RD-2061` ✗        |
| **2062** | RD-2062       | AZAM           | Turner      | `RD-2062` ✗        |

## Yasine CP · 1 people

| Enrol as | Employee code | Name   | Designation | Stored in RadoFlow |
| -------- | ------------- | ------ | ----------- | ------------------ |
| **2393** | RD-2393       | YASINE | 220000      | `RD-2393` ✗        |

## Zafar Nug Packing · 1 people

| Enrol as | Employee code | Name  | Designation | Stored in RadoFlow |
| -------- | ------------- | ----- | ----------- | ------------------ |
| **2394** | RD-2394       | ZAFAR | 190000      | `RD-2394` ✗        |
