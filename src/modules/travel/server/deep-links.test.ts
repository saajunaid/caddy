import { describe, expect, it } from "vitest";
import {
  bookingUrl,
  DFA_ADVICE_INDEX,
  dfaAdviceUrl,
  googleFlightsUrl,
  iataCode,
  skyscannerUrl,
  yymmdd,
} from "./deep-links";
import type { Party } from "./travellers";

const family: Party = {
  adults: 2,
  children: 2,
  childAges: [8, 4],
  unconfirmedChildren: 0,
};
const couple: Party = {
  adults: 2,
  children: 0,
  childAges: [],
  unconfirmedChildren: 0,
};

describe("search links", () => {
  it("recognise airport codes", () => {
    expect(iataCode("fao")).toBe("FAO");
    expect(iataCode(" DUB ")).toBe("DUB");
    expect(iataCode("Faro")).toBeNull();
    expect(iataCode(null)).toBeNull();
    expect(yymmdd("2027-02-14")).toBe("270214");
  });

  it("build Skyscanner links with adults and children's ages", () => {
    expect(
      skyscannerUrl({
        from: "DUB",
        to: "FAO",
        outbound: "2027-02-14",
        inbound: "2027-02-21",
        party: family,
      }),
    ).toBe(
      "https://www.skyscanner.ie/transport/flights/dub/fao/270214/270221/?adultsv2=2&childrenv2=8%7C4",
    );
    expect(
      skyscannerUrl({
        from: "SNN",
        to: "TFS",
        outbound: "2027-02-14",
        inbound: "2027-02-21",
        party: couple,
      }),
    ).toBe(
      "https://www.skyscanner.ie/transport/flights/snn/tfs/270214/270221/?adultsv2=2",
    );
  });

  it("fall back to Skyscanner's everywhere search without a destination code", () => {
    expect(
      skyscannerUrl({
        from: "DUB",
        to: "Algarve",
        outbound: "2027-02-14",
        inbound: "2027-02-21",
        party: couple,
      }),
    ).toBe(
      "https://www.skyscanner.ie/transport/flights-from/dub/270214/270221/?adultsv2=2",
    );
    expect(
      skyscannerUrl({
        from: "Belfast",
        to: "FAO",
        outbound: "2027-02-14",
        inbound: "2027-02-21",
        party: couple,
      }),
    ).toBeNull();
  });

  it("build Google Flights queries in words", () => {
    const url = googleFlightsUrl({
      from: "DUB",
      to: "FAO",
      outbound: "2027-02-14",
      inbound: "2027-02-21",
      party: family,
    });
    expect(url.startsWith("https://www.google.com/travel/flights?q=")).toBe(
      true,
    );
    expect(decodeURIComponent(url.split("?q=")[1])).toBe(
      "Flights from DUB to FAO on 2027-02-14 returning 2027-02-21 for 2 adults and 2 children",
    );
    const text = googleFlightsUrl({
      from: "ORK",
      to: "Puerto de la Cruz",
      outbound: "2027-02-14",
      inbound: "2027-02-21",
      party: { adults: 1, children: 1, childAges: [5], unconfirmedChildren: 0 },
    });
    expect(decodeURIComponent(text.split("?q=")[1])).toBe(
      "Flights from ORK to Puerto de la Cruz on 2027-02-14 returning 2027-02-21 for 1 adult and 1 child",
    );
  });

  it("build Booking.com searches with one age per child", () => {
    expect(
      bookingUrl({
        destination: "Albufeira",
        checkin: "2027-02-14",
        checkout: "2027-02-20",
        party: family,
      }),
    ).toBe(
      "https://www.booking.com/searchresults.html?ss=Albufeira&checkin=2027-02-14&checkout=2027-02-20&group_adults=2&group_children=2&age=8&age=4&no_rooms=1",
    );
    expect(
      bookingUrl({
        destination: "Puerto de la Cruz, Tenerife",
        checkin: "2027-02-14",
        checkout: "2027-02-21",
        party: couple,
      }),
    ).toBe(
      "https://www.booking.com/searchresults.html?ss=Puerto+de+la+Cruz%2C+Tenerife&checkin=2027-02-14&checkout=2027-02-21&group_adults=2&group_children=0&no_rooms=1",
    );
  });

  it("always search for at least one adult", () => {
    const url = bookingUrl({
      destination: null,
      checkin: "2027-02-14",
      checkout: "2027-02-21",
      party: { adults: 0, children: 0, childAges: [], unconfirmedChildren: 0 },
    });
    expect(url).toContain("group_adults=1");
    expect(url).not.toContain("ss=");
  });

  it("link to Irish DFA travel advice, or its index when the country is unknown", () => {
    expect(dfaAdviceUrl("PT")).toBe(
      "https://www.ireland.ie/en/dfa/overseas-travel/advice/portugal/",
    );
    expect(dfaAdviceUrl("AE")).toBe(`${DFA_ADVICE_INDEX}united-arab-emirates/`);
    expect(dfaAdviceUrl("TR")).toBe(DFA_ADVICE_INDEX);
    expect(dfaAdviceUrl(null)).toBe(DFA_ADVICE_INDEX);
    expect(dfaAdviceUrl("ZZ")).toBe(DFA_ADVICE_INDEX);
  });
});
