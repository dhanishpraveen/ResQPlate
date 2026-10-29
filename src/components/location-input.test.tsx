import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import { LocationInput, geolocationErrorMessage, type LocationValue } from "./location-input";
import { parseReverseGeocodeAddress } from "../lib/geocoding";

const mapTestState = vi.hoisted(() => ({
  click: null as ((event: { latlng: { lat: number; lng: number } }) => void) | null,
  setView: vi.fn(),
  invalidateSize: vi.fn(),
}));

vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Marker: () => null,
  TileLayer: () => null,
  useMap: () => ({ invalidateSize: mapTestState.invalidateSize, setView: mapTestState.setView }),
  useMapEvents: (handlers: { click: (event: { latlng: { lat: number; lng: number } }) => void }) => {
    mapTestState.click = handlers.click;
    return null;
  },
}));

describe("LocationInput", () => {
  const value: LocationValue = { address: "", latitude: null, longitude: null };

  beforeEach(() => {
    vi.restoreAllMocks();
    mapTestState.click = null;
    mapTestState.setView.mockClear();
    mapTestState.invalidateSize.mockClear();
    vi.unstubAllEnvs();
  });
  afterEach(() => cleanup());

  it("passes successful browser coordinates to the form", async () => {
    const onChange = vi.fn();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ display_name: "Detected address" }), { status: 200 }));
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: vi.fn((success: PositionCallback) => {
          success({ coords: { latitude: 12.9716, longitude: 77.5946 } } as GeolocationPosition);
        }),
      },
    });

    render(<LocationInput label="Pickup location" onChange={onChange} value={value} />);
    fireEvent.click(screen.getByRole("button", { name: "Use Current Location" }));

    expect(onChange).toHaveBeenCalledWith({ address: "", latitude: 12.9716, longitude: 77.5946 });
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith({ address: "Detected address", latitude: 12.9716, longitude: 77.5946 }));
  });

  it("shows a clear permission error when location access is denied", () => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: vi.fn((_success: PositionCallback, failure: PositionErrorCallback) => {
          failure({ code: 1 } as GeolocationPositionError);
        }),
      },
    });

    render(<LocationInput label="Drop-off location" onChange={vi.fn()} value={value} />);
    fireEvent.click(screen.getByRole("button", { name: "Use Current Location" }));

    expect(screen.getByText(/Location permission was denied/)).toBeInTheDocument();
  });

  it("maps browser timeout errors to actionable text", () => {
    expect(geolocationErrorMessage({ code: 3 })).toMatch(/timed out/);
  });

  it("zooms the map to existing coordinates and invalidates its size", () => {
    render(<LocationInput label="Pickup location" onChange={vi.fn()} value={{ address: "", latitude: 12.9716, longitude: 77.5946 }} />);
    expect(mapTestState.setView).toHaveBeenCalledWith([12.9716, 77.5946], 17);
    expect(mapTestState.invalidateSize).toHaveBeenCalled();
  });

  it("reverse-geocodes selected coordinates and preserves coordinates on lookup failure", async () => {
    vi.stubEnv("VITE_GEOCODING_URL", "https://geocoder.example/reverse");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ display_name: "12 Example Street" }), { status: 200 }),
    );
    const onChange = vi.fn();
    render(<LocationInput label="Pickup location" onChange={onChange} value={value} />);
    mapTestState.click?.({ latlng: { lat: 12.9718, lng: 77.5948 } });

    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith({ address: "12 Example Street", latitude: 12.9718, longitude: 77.5948 }));
  });

  it("reports reverse-geocoding failure without replacing the address with coordinates", async () => {
    vi.stubEnv("VITE_GEOCODING_URL", "https://geocoder.example/reverse");
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network unavailable"));
    const onChange = vi.fn();
    render(<LocationInput label="Pickup location" onChange={onChange} value={value} />);
    mapTestState.click?.({ latlng: { lat: 12.9717, lng: 77.5947 } });

    expect(await screen.findByText(/address could not be resolved/i)).toBeInTheDocument();
    expect(onChange).toHaveBeenCalledWith({ address: "", latitude: 12.9717, longitude: 77.5947 });
  });

  it("uses locality fields when a reverse-geocoder has no display name", () => {
    expect(parseReverseGeocodeAddress({ address: { road: "Main Road", city: "Bengaluru", country: "India" } }))
      .toBe("Main Road, Bengaluru, India");
    expect(parseReverseGeocodeAddress({ address: {} })).toBeNull();
  });
});
