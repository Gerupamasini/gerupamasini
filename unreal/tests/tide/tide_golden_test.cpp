// Checks the C++ tide port (TideCore.cpp) against the fixtures that the TypeScript model writes
// (tests/unit/tideGoldenUnreal.test.ts). Builds without Unreal: see CMakeLists.txt next to this file.

#include "TideCore/TideCore.h"

#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <fstream>
#include <sstream>
#include <string>
#include <vector>

using namespace HigataTide;

namespace
{
	int Failures = 0;
	int Checks = 0;

	void Check(bool bOk, const std::string& What)
	{
		++Checks;
		if (!bOk && Failures++ < 20)
		{
			std::fprintf(stderr, "FAIL %s\n", What.c_str());
		}
	}

	std::string Num(double V)
	{
		char Buf[64];
		std::snprintf(Buf, sizeof Buf, "%.17g", V);
		return Buf;
	}

	struct FWindow
	{
		double From = 0, To = 0;
		std::vector<FExtremum> Expected;
	};

	void RunFixture(const std::string& Path)
	{
		std::ifstream In(Path);
		if (!In)
		{
			Check(false, "cannot open " + Path);
			return;
		}

		FStation Station;
		std::vector<std::string> Lines;
		for (std::string Line; std::getline(In, Line);)
		{
			if (Line.empty() || Line[0] == '#') continue;
			Lines.push_back(Line);
		}

		// First pass: the station definition.
		for (const std::string& Line : Lines)
		{
			std::istringstream S(Line);
			std::string Tag;
			S >> Tag;
			if (Tag == "station")
			{
				std::string Ref, Conv;
				S >> Station.Id >> Ref >> Conv;
				Station.PhaseReference = Ref == "JST135E" ? EPhaseReference::JST135E : EPhaseReference::UTC;
				Station.PhaseConvention = Conv == "meridian_species" ? EPhaseConvention::MeridianSpecies : EPhaseConvention::ZoneSpeed;
			}
			else if (Tag == "c")
			{
				FStationConstituent C;
				S >> C.Name >> C.AmplitudeCm >> C.PhaseDeg;
				Station.Constituents.push_back(C);
			}
		}

		const FTideModel Model(Station);
		Check(Model.GetUnknownConstituents().empty(), Station.Id + ": unknown constituents");

		std::vector<FWindow> Windows;
		for (const std::string& Line : Lines)
		{
			std::istringstream S(Line);
			std::string Tag;
			S >> Tag;
			if (Tag == "max")
			{
				double Want;
				S >> Want;
				Check(std::fabs(Model.MaxAmplitude() - Want) < 1e-12, Station.Id + " max " + Num(Model.MaxAmplitude()) + " != " + Num(Want));
			}
			else if (Tag == "level" || Tag == "rate")
			{
				double T, Want;
				S >> T >> Want;
				const double Got = Tag == "level" ? Model.Level(T) : Model.Rate(T);
				// Same formulas in the same order: only libm differences (≪ 1 µm) are allowed.
				Check(std::fabs(Got - Want) < 1e-9, Station.Id + " " + Tag + " @" + Num(T) + ": " + Num(Got) + " != " + Num(Want));
			}
			else if (Tag == "window")
			{
				FWindow W;
				S >> W.From >> W.To;
				Windows.push_back(W);
			}
			else if (Tag == "extremum" && !Windows.empty())
			{
				FExtremum E;
				std::string Kind;
				S >> E.TimeMs >> E.Level >> Kind;
				E.bHigh = Kind == "high";
				Windows.back().Expected.push_back(E);
			}
		}

		for (const FWindow& W : Windows)
		{
			const std::vector<FExtremum> Got = Model.Extrema(W.From, W.To);
			Check(Got.size() == W.Expected.size(), Station.Id + " window " + Num(W.From) + ": " + std::to_string(Got.size()) + " extrema, want " + std::to_string(W.Expected.size()));
			for (size_t I = 0; I < Got.size() && I < W.Expected.size(); ++I)
			{
				const FExtremum& G = Got[I];
				const FExtremum& E = W.Expected[I];
				Check(G.bHigh == E.bHigh, Station.Id + " extremum kind #" + std::to_string(I));
				Check(std::fabs(G.TimeMs - E.TimeMs) < 1000, Station.Id + " extremum time " + Num(G.TimeMs) + " != " + Num(E.TimeMs));
				Check(std::fabs(G.Level - E.Level) < 1e-9, Station.Id + " extremum level " + Num(G.Level) + " != " + Num(E.Level));
			}
		}
	}
}

int main(int Argc, char** Argv)
{
	if (Argc < 2)
	{
		std::fprintf(stderr, "usage: %s fixture.txt...\n", Argv[0]);
		return 2;
	}
	for (int I = 1; I < Argc; ++I)
	{
		RunFixture(Argv[I]);
	}
	std::printf("%d checks, %d failures\n", Checks, Failures);
	return Failures == 0 ? EXIT_SUCCESS : EXIT_FAILURE;
}
