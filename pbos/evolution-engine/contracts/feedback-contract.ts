/*
===============================================================================

PBOS Feedback Contract

Authority

PBOS-CIP-008A-002

Classification

Evolution Runtime Contract

===============================================================================
*/


export type FeedbackType =

    | "SUCCESS"

    | "FAILURE"

    | "IMPROVEMENT"

    | "WARNING"

    | "INSIGHT";



export interface FeedbackContract {


    readonly id: string;


    readonly sourceExecutionId: string;


    readonly type: FeedbackType;


    readonly message: string;


    readonly confidence: number;


    readonly createdAt: Date;


    readonly metadata: Record<string, unknown>;


}
