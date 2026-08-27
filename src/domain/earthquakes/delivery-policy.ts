export type EarthquakeEligibilityInput = {
	magnitude: number | null;
	distanceKm: number;
};

export type EarthquakeSubscriptionCriteria = {
	minimumMagnitude: number;
	radiusKm: number;
};

export type DeliveryPolicyInput = {
	hasDelivery: boolean;
	isBaseline: boolean;
	isEligible: boolean;
	sourceUpdatedAt: Date;
	deliveredRevisionAt: Date | null;
};

export type DeliveryAction = 'none' | 'create' | 'edit';

export function isEarthquakeEligible(
	event: EarthquakeEligibilityInput,
	criteria: EarthquakeSubscriptionCriteria
) {
	if (event.magnitude === null || !Number.isFinite(event.magnitude)) {
		return false;
	}

	return event.magnitude >= criteria.minimumMagnitude
		&& event.distanceKm <= criteria.radiusKm;
}

export function determineDeliveryAction(input: DeliveryPolicyInput): DeliveryAction {
	if (input.isBaseline) {
		return 'none';
	}

	if (!input.hasDelivery) {
		return input.isEligible ? 'create' : 'none';
	}

	if (!input.deliveredRevisionAt || input.sourceUpdatedAt > input.deliveredRevisionAt) {
		return 'edit';
	}

	return 'none';
}
