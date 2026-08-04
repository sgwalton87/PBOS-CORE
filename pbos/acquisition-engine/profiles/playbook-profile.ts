/*
===============================================================================

PBOS Playbook Acquisition Profile

Authority

PBOS-CIP-010B-002

Classification

System Identity Profile

===============================================================================
*/


import {

    PlaybookSystemContract

}

from "../contracts/playbook-system-contract";



export const PLAYBOOK_PROFILE:

    PlaybookSystemContract = {



    systemId:

        "PLAYBOOK-SYSTEM-001",



    systemName:

        "Playbook Platform",



    repositoryName:

        "playbook-platform",



    repositoryPath:

        "../playbook-platform",



    mission:

        "Create an operating system for scholar, athlete, mentor, and community growth.",



    operatingDomains:

        [

            "Education",

            "Athletics",

            "Mentorship",

            "Career Development",

            "Financial Literacy"

        ],



    knownRoles:

        [

            "Scholar",

            "Scholar Athlete",

            "Mentor",

            "Coach",

            "Counselor",

            "Administrator"

        ],



    knownCapabilities:

        [

            "Profiles",

            "Courses",

            "Mentorship",

            "Scholarships",

            "Recruiting",

            "Community"

        ],



    acquisitionVersion:

        "1.0.0",



    createdAt:

        new Date()


};
