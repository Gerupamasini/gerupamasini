// Harmonic tide prediction, ported from src/tide/ (TideModel.ts, astro.ts, constituents.ts).
//
// Plain C++17 with no Unreal headers: the same sources build inside the HigataTide module and in the
// standalone golden test (unreal/tests/tide), which checks them against fixtures written by the TypeScript model
// (tests/unit/tideGoldenUnreal.test.ts). Change both sides together.
//
// Times are UTC epochs in milliseconds held in a double, exactly as JavaScript numbers, so that the two
// implementations do the same arithmetic.

#pragma once

#include <array>
#include <string>
#include <vector>

namespace HigataTide
{
	struct FAstroArgs
	{
		/** Julian centuries since J2000.0 (UT; the TT difference is ignored, < 1 minute of error). */
		double T = 0.0;
		/** Moon mean longitude (degrees). */
		double S = 0.0;
		/** Sun mean longitude. */
		double H = 0.0;
		/** Lunar perigee. */
		double P = 0.0;
		/** Lunar ascending node. */
		double N = 0.0;
		/** Solar perigee. */
		double Pp = 0.0;
		/** Mean lunar time angle (Greenwich). */
		double Tau = 0.0;
	};

	double Norm360(double X);
	double JulianDate(double Ms);
	FAstroArgs ComputeAstroArgs(double Ms);

	enum class ENodalClass
	{
		None, M2, K1, O1, K2, M4, MS4, MN4, J1, M1, L2, MM, MF, OO1
	};

	struct FConstituentDef
	{
		const char* Name;
		/** Doodson numbers (tau, s, h, p, N', p'). */
		std::array<int, 6> Doodson;
		/** Phase constant in degrees added to the Doodson argument. */
		double Phase;
		/** Degrees per mean solar hour. */
		double Speed;
		ENodalClass Nodal;
	};

	/** The constituent catalogue, or nullptr for an unknown name. Names follow the JMA / IHO table. */
	const FConstituentDef* FindConstituent(const std::string& Name);

	struct FNodal
	{
		double F = 1.0;
		/** Degrees. */
		double U = 0.0;
	};

	/** Nodal factor f and phase correction u for a nodal class, N = lunar node longitude (degrees). */
	FNodal NodalCorrection(ENodalClass Class, double NDeg);

	/** Phase lags in Japanese tables are referred to the 135°E (JST) meridian. */
	enum class EPhaseReference
	{
		UTC, JST135E
	};

	/**
	 * How the zone reference is applied to the equilibrium argument.
	 * ZoneSpeed       : V = V_G(t_UT) + speed × 9 h  (zone-time epochs, XTide / NOAA style)
	 * MeridianSpecies : V = V_G(t_UT) + species × 135° (equilibrium argument at the 135°E meridian)
	 */
	enum class EPhaseConvention
	{
		ZoneSpeed, MeridianSpecies
	};

	struct FStationConstituent
	{
		std::string Name;
		double AmplitudeCm = 0.0;
		double PhaseDeg = 0.0;
	};

	struct FStation
	{
		std::string Id;
		double Lat = 0.0;
		double Lon = 0.0;
		EPhaseReference PhaseReference = EPhaseReference::UTC;
		EPhaseConvention PhaseConvention = EPhaseConvention::ZoneSpeed;
		std::vector<FStationConstituent> Constituents;
	};

	struct FExtremum
	{
		double TimeMs = 0.0;
		double Level = 0.0;
		bool bHigh = false;
	};

	class FTideModel
	{
	public:
		explicit FTideModel(const FStation& InStation);

		/** Tide height in metres relative to mean sea level at a UTC epoch (ms). */
		double Level(double Ms) const;

		/** Rate of change in metres per hour (central difference). */
		double Rate(double Ms) const;

		/** High and low waters between two epochs, refined to ~10 s. */
		std::vector<FExtremum> Extrema(double FromMs, double ToMs) const;

		/** Approximate spring-tide amplitude: sum of the main constituent amplitudes (metres). */
		double MaxAmplitude() const;

		const FStation& GetStation() const { return Station; }

		/** Constituent names in the station data that the catalogue does not know; they are ignored. */
		const std::vector<std::string>& GetUnknownConstituents() const { return Unknown; }

	private:
		struct FActive
		{
			const FConstituentDef* Def;
			double H; // metres
			double Kappa; // degrees
		};

		FStation Station;
		std::vector<FActive> Active;
		std::vector<std::string> Unknown;
	};
}
