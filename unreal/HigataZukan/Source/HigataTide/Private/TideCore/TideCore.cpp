// Port of src/tide/ — keep the arithmetic in the same order as the TypeScript so the golden fixtures match.

#include "TideCore/TideCore.h"

#include <cmath>

namespace HigataTide
{
	namespace
	{
		constexpr double Pi = 3.14159265358979323846;
		constexpr double ZoneHours = 9.0;
		constexpr double ZoneDeg = 135.0;

		// JavaScript's % keeps the sign of the dividend, as std::fmod does.
		double JsMod(double A, double B) { return std::fmod(A, B); }

		using EN = ENodalClass;

		const FConstituentDef Catalogue[] = {
			// long period
			{"Sa", {0, 0, 1, 0, 0, 0}, 0, 0.0410686, EN::None},
			{"Ssa", {0, 0, 2, 0, 0, 0}, 0, 0.0821373, EN::None},
			{"Mm", {0, 1, 0, -1, 0, 0}, 0, 0.5443747, EN::MM},
			{"MSf", {0, 2, -2, 0, 0, 0}, 0, 1.0158958, EN::None},
			{"Mf", {0, 2, 0, 0, 0, 0}, 0, 1.0980331, EN::MF},
			// diurnal
			{"2Q1", {1, -3, 0, 2, 0, 0}, -90, 12.8542862, EN::O1},
			{"sigma1", {1, -3, 2, 0, 0, 0}, -90, 12.9271398, EN::O1},
			{"Q1", {1, -2, 0, 1, 0, 0}, -90, 13.3986609, EN::O1},
			{"rho1", {1, -2, 2, -1, 0, 0}, -90, 13.4715145, EN::O1},
			{"O1", {1, -1, 0, 0, 0, 0}, -90, 13.9430356, EN::O1},
			{"MP1", {1, -1, 2, 0, 0, 0}, -90, 14.0251729, EN::None},
			{"M1", {1, 0, 0, 1, 0, 0}, 90, 14.4966939, EN::M1},
			{"chi1", {1, 0, 2, -1, 0, 0}, 90, 14.5695476, EN::J1},
			{"pi1", {1, 1, -3, 0, 0, 1}, -90, 14.9178647, EN::None},
			{"P1", {1, 1, -2, 0, 0, 0}, -90, 14.9589314, EN::None},
			{"S1", {1, 1, -1, 0, 0, 0}, 0, 15.0, EN::None},
			{"K1", {1, 1, 0, 0, 0, 0}, 90, 15.0410686, EN::K1},
			{"psi1", {1, 1, 1, 0, 0, -1}, 90, 15.0821353, EN::None},
			{"phi1", {1, 1, 2, 0, 0, 0}, 90, 15.1232059, EN::None},
			{"theta1", {1, 2, -2, 1, 0, 0}, 90, 15.5125897, EN::J1},
			{"J1", {1, 2, 0, -1, 0, 0}, 90, 15.5854433, EN::J1},
			{"SO1", {1, 3, -2, 0, 0, 0}, 90, 16.0569644, EN::None},
			{"OO1", {1, 3, 0, 0, 0, 0}, 90, 16.1391017, EN::OO1},
			// semidiurnal
			{"OQ2", {2, -3, 0, 3, 0, 0}, 0, 27.3416964, EN::M2},
			{"MNS2", {2, -3, 2, 1, 0, 0}, 0, 27.4238337, EN::M2},
			{"2N2", {2, -2, 0, 2, 0, 0}, 0, 27.8953548, EN::M2},
			{"mu2", {2, -2, 2, 0, 0, 0}, 0, 27.9682084, EN::M2},
			{"N2", {2, -1, 0, 1, 0, 0}, 0, 28.4397295, EN::M2},
			{"nu2", {2, -1, 2, -1, 0, 0}, 0, 28.5125831, EN::M2},
			{"OP2", {2, -1, 2, 0, 0, 0}, 180, 28.9019669, EN::None},
			{"M2", {2, 0, 0, 0, 0, 0}, 0, 28.9841042, EN::M2},
			{"MKS2", {2, 0, 2, 0, 0, 0}, 0, 29.0662415, EN::M2},
			{"lambda2", {2, 1, -2, 1, 0, 0}, 180, 29.4556253, EN::M2},
			{"L2", {2, 1, 0, -1, 0, 0}, 180, 29.5284789, EN::L2},
			{"T2", {2, 2, -3, 0, 0, 1}, 0, 29.9589333, EN::None},
			{"S2", {2, 2, -2, 0, 0, 0}, 0, 30.0, EN::None},
			{"R2", {2, 2, -1, 0, 0, -1}, 180, 30.0410667, EN::None},
			{"K2", {2, 2, 0, 0, 0, 0}, 0, 30.0821373, EN::K2},
			{"MSN2", {2, 3, -2, -1, 0, 0}, 0, 30.5443747, EN::M2},
			{"KJ2", {2, 3, 0, -1, 0, 0}, 0, 30.6265120, EN::K2},
			{"2SM2", {2, 4, -4, 0, 0, 0}, 0, 31.0158958, EN::M2},
			// third diurnal
			{"MO3", {3, -1, 0, 0, 0, 0}, -90, 42.9271398, EN::M2},
			{"M3", {3, 0, 0, 0, 0, 0}, 180, 43.4761563, EN::M2},
			{"SO3", {3, 1, -2, 0, 0, 0}, -90, 43.9430356, EN::O1},
			{"MK3", {3, 1, 0, 0, 0, 0}, 90, 44.0251729, EN::M2},
			{"SK3", {3, 3, -2, 0, 0, 0}, 90, 45.0410686, EN::K1},
			// shallow water quarter diurnal
			{"MN4", {4, -1, 0, 1, 0, 0}, 0, 57.4238337, EN::MN4},
			{"M4", {4, 0, 0, 0, 0, 0}, 0, 57.9682084, EN::M4},
			{"SN4", {4, 1, -2, 1, 0, 0}, 0, 58.4397295, EN::M2},
			{"MS4", {4, 2, -2, 0, 0, 0}, 0, 58.9841042, EN::MS4},
			{"MK4", {4, 2, 0, 0, 0, 0}, 0, 59.0662415, EN::M4},
			{"S4", {4, 4, -4, 0, 0, 0}, 0, 60.0, EN::None},
			{"SK4", {4, 4, -2, 0, 0, 0}, 0, 60.0821373, EN::K2},
			// sixth diurnal
			{"2MN6", {6, -1, 0, 1, 0, 0}, 0, 86.4079380, EN::M4},
			{"M6", {6, 0, 0, 0, 0, 0}, 0, 86.9523127, EN::M4},
			{"MSN6", {6, 1, -2, 1, 0, 0}, 0, 87.4238337, EN::M4},
			{"2MS6", {6, 2, -2, 0, 0, 0}, 0, 87.9682084, EN::M4},
			{"2MK6", {6, 2, 0, 0, 0, 0}, 0, 88.0503457, EN::M4},
			{"2SM6", {6, 4, -4, 0, 0, 0}, 0, 88.9841042, EN::M2},
			{"MSK6", {6, 4, -2, 0, 0, 0}, 0, 89.0662415, EN::M2},
		};
	}

	double Norm360(double X)
	{
		return JsMod(JsMod(X, 360.0) + 360.0, 360.0);
	}

	double JulianDate(double Ms)
	{
		return Ms / 86400000 + 2440587.5;
	}

	FAstroArgs ComputeAstroArgs(double Ms)
	{
		const double Jd = JulianDate(Ms);
		const double T = (Jd - 2451545.0) / 36525;
		const double T2 = T * T;
		FAstroArgs A;
		A.T = T;
		A.S = Norm360(218.3164477 + 481267.88123421 * T - 0.0015786 * T2);
		A.H = Norm360(280.46646 + 36000.76983 * T + 0.0003032 * T2);
		A.P = Norm360(83.3532465 + 4069.0137287 * T - 0.01032 * T2);
		A.N = Norm360(125.0445479 - 1934.1362891 * T + 0.0020754 * T2);
		A.Pp = Norm360(282.93735 + 1.71946 * T);
		// hours of the UT day
		const double HoursUT = JsMod(JsMod(Ms / 3600000, 24.0) + 24, 24.0);
		A.Tau = Norm360(15 * HoursUT - A.S + A.H);
		return A;
	}

	const FConstituentDef* FindConstituent(const std::string& Name)
	{
		for (const FConstituentDef& Def : Catalogue)
		{
			if (Name == Def.Name)
			{
				return &Def;
			}
		}
		return nullptr;
	}

	FNodal NodalCorrection(ENodalClass Class, double NDeg)
	{
		const double N = (NDeg * Pi) / 180;
		const double C1 = std::cos(N), C2 = std::cos(2 * N), C3 = std::cos(3 * N);
		const double S1 = std::sin(N), S2 = std::sin(2 * N), S3 = std::sin(3 * N);
		switch (Class)
		{
		case EN::M2: return {1.0004 - 0.0373 * C1 + 0.0002 * C2, -2.14 * S1};
		case EN::K1: return {1.006 + 0.115 * C1 - 0.0088 * C2 + 0.0006 * C3, -8.86 * S1 + 0.68 * S2 - 0.07 * S3};
		case EN::O1: return {1.0089 + 0.1871 * C1 - 0.0147 * C2 + 0.0014 * C3, 10.8 * S1 - 1.34 * S2 + 0.19 * S3};
		case EN::K2: return {1.0241 + 0.2863 * C1 + 0.0083 * C2 - 0.0015 * C3, -17.74 * S1 + 0.68 * S2 - 0.04 * S3};
		case EN::J1: return {1.0129 + 0.1676 * C1 - 0.017 * C2 + 0.0016 * C3, -12.94 * S1 + 1.34 * S2 - 0.19 * S3};
		case EN::OO1: return {1.1027 + 0.6504 * C1 + 0.0317 * C2 - 0.0014 * C3, -36.68 * S1 + 4.02 * S2 - 0.57 * S3};
		case EN::M1: return {1.0, 0}; // simplified: M1 nodal dependence omitted
		case EN::L2: return {1.0004 - 0.0373 * C1 + 0.0002 * C2, -2.14 * S1}; // approximated as M2
		case EN::MM: return {1.0 - 0.1300 * C1 + 0.0013 * C2, 0};
		case EN::MF: return {1.0429 + 0.4135 * C1 - 0.004 * C2, -23.74 * S1 + 2.68 * S2 - 0.38 * S3};
		case EN::M4:
		case EN::MN4:
		{
			const FNodal M = NodalCorrection(EN::M2, NDeg);
			return {M.F * M.F, 2 * M.U};
		}
		case EN::MS4: return NodalCorrection(EN::M2, NDeg);
		default: return {1, 0};
		}
	}

	FTideModel::FTideModel(const FStation& InStation)
		: Station(InStation)
	{
		for (const FStationConstituent& C : Station.Constituents)
		{
			const FConstituentDef* Def = FindConstituent(C.Name);
			if (!Def)
			{
				Unknown.push_back(C.Name);
				continue;
			}
			Active.push_back({Def, C.AmplitudeCm / 100, C.PhaseDeg});
		}
	}

	double FTideModel::Level(double Ms) const
	{
		const FAstroArgs A = ComputeAstroArgs(Ms);
		const double Args[6] = {A.Tau, A.S, A.H, A.P, -A.N, A.Pp};
		double Sum = 0;
		for (const FActive& C : Active)
		{
			double V = C.Def->Phase;
			for (size_t I = 0; I < 6; I++)
			{
				V += C.Def->Doodson[I] * Args[I];
			}
			if (Station.PhaseReference == EPhaseReference::JST135E)
			{
				V += Station.PhaseConvention == EPhaseConvention::ZoneSpeed ? C.Def->Speed * ZoneHours : C.Def->Doodson[0] * ZoneDeg;
			}
			const FNodal Nod = NodalCorrection(C.Def->Nodal, A.N);
			const double Phase = (Norm360(V + Nod.U - C.Kappa) * Pi) / 180;
			Sum += Nod.F * C.H * std::cos(Phase);
		}
		return Sum;
	}

	double FTideModel::Rate(double Ms) const
	{
		const double Dt = 5 * 60 * 1000;
		return (Level(Ms + Dt) - Level(Ms - Dt)) / (2 * (Dt / 3600000));
	}

	std::vector<FExtremum> FTideModel::Extrema(double FromMs, double ToMs) const
	{
		std::vector<FExtremum> Out;
		const double Step = 10 * 60 * 1000;
		double TPrev = FromMs;
		double VPrev = Level(TPrev);
		double TCur = FromMs + Step;
		double VCur = Level(TCur);
		for (double T = FromMs + 2 * Step; T <= ToMs; T += Step)
		{
			const double V = Level(T);
			if ((VCur > VPrev && VCur >= V) || (VCur < VPrev && VCur <= V))
			{
				const bool bHigh = VCur > VPrev;
				// golden-section refinement in [TPrev, T]
				double Lo = TPrev, Hi = T;
				const double Sign = bHigh ? 1 : -1;
				const double G = (std::sqrt(5.0) - 1) / 2;
				double X1 = Hi - G * (Hi - Lo), X2 = Lo + G * (Hi - Lo);
				double F1 = Sign * Level(X1), F2 = Sign * Level(X2);
				while (Hi - Lo > 10 * 1000)
				{
					if (F1 < F2)
					{
						Lo = X1; X1 = X2; F1 = F2; X2 = Lo + G * (Hi - Lo); F2 = Sign * Level(X2);
					}
					else
					{
						Hi = X2; X2 = X1; F2 = F1; X1 = Hi - G * (Hi - Lo); F1 = Sign * Level(X1);
					}
				}
				const double Tm = (Lo + Hi) / 2;
				Out.push_back({Tm, Level(Tm), bHigh});
			}
			TPrev = TCur; VPrev = VCur; TCur = T; VCur = V;
		}
		return Out;
	}

	double FTideModel::MaxAmplitude() const
	{
		double S = 0;
		for (const FActive& C : Active)
		{
			S += C.H;
		}
		return S;
	}
}
